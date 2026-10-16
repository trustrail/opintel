import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createPublicKey} from 'node:crypto';
import {parse} from 'dotenv';
import {z} from 'zod';
import {errorCodeSchema} from '../src/shared/error-contract.js';
import {DescribeOutput,QueryOutput} from '../src/shared/api/mcp.js';
import {releaseRedeemOutput,sealedPrefix} from '../src/shared/release-contract.js';
import {verifyGrant,unsealCell,xorShares} from '../src/modules/release-custody/index.js';

const configuration=z.object({
 OPINTEL_API_BASE_URL:z.url().default('http://localhost:3000').refine(v=>{const u=new URL(v);return ['http:','https:'].includes(u.protocol)&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/';}),
 OPINTEL_XQ_TEST_PROJECT_ID:z.uuid(),OPINTEL_XQ_TEST_POOL_KEY:z.string().min(1),
 OPINTEL_XQ_API_KEY:z.string().default(''),OPINTEL_XQ_SENDER_ALIAS:z.string().default(''),OPINTEL_XQ_SENDER_ACCESS_TOKEN:z.string().default(''),OPINTEL_XQ_REDEEM_URL:z.string().default(''),
});
export type XqIntegrationConfig=z.infer<typeof configuration>;
export interface XqIntegrationPort {
 call(name:string,args:Record<string,unknown>):Promise<unknown>;
 authorize(alias:string):Promise<string>;
 fetchShare(locator:string,alias:string,token:string):Promise<Uint8Array>;
 revoke(locator:string):Promise<void>;
 close():Promise<void>;
}
const response=z.object({isError:z.boolean().optional(),structuredContent:z.unknown().optional(),_meta:z.object({code:z.string().optional()}).passthrough().optional()});
export class IntegrationFailure extends Error {
 constructor(readonly stage:string,readonly receipt:string|undefined,readonly cleanupFailed=false){super(`XQ integration failed at ${stage}.${receipt?` Receipt: ${receipt}.`:''}${cleanupFailed?' XQ cleanup was not acknowledged; the grant expiry remains the cleanup bound.':''} No values or credentials were printed.`);}
}
export function readIntegrationConfig(text:string){
 const env=parse(text);
 if(process.env.NODE_ENV==='production'||env.NODE_ENV==='production')throw new Error('XQ integration is development-only.');
 const result=configuration.safeParse(env);
 if(!result.success)throw new Error('Set valid local configuration: '+[...new Set(result.error.issues.map(i=>i.path[0]))].join(', ')+'. No values were printed.');
 return result.data;
}
function content(raw:unknown){const r=response.parse(raw);if(r.isError)throw new Error('Tool refused');return r.structuredContent;}
export const treatments=['clear','tokenized','masked','aggregate_only','custody','withheld'] as const;
type Treatment=typeof treatments[number];
type Outcome='passed'|'failed'|'inconclusive';
export type ProbeResult={object:string;column:string;treatment:Treatment;probe:'sample'|'aggregate'|'raw-refusal';outcome:Outcome;detail:string;code?:string;receipt?:string;rows?:number;nonNullCells?:number;decryptedCells?:number;rowScopes?:{poolId:string;decisionIds:string[];hash:string|null;missingDecision:boolean}[]};
export type AgentReport={startedAt:string;finishedAt:string;projectId:string;objects:number;attributes:number;results:ProbeResult[];summary:{treatment:Treatment;attributes:number;probes:number;passed:number;failed:number;inconclusive:number}[];sessionErrors:string[];limitations:string[]};
const quote=(name:string)=>'"'+name.replaceAll('"','""')+'"';
function qualified(name:string){const parts=name.split('.');if(parts.length!==3||parts.some(p=>!p||p.includes('\0')))throw new Error('Unsupported object name');return parts.map(quote).join('.');}
function receiptMeta(output:z.infer<typeof QueryOutput>){return {receipt:z.uuid().parse(output.evidenceId),rows:output.rows.length,rowScopes:output.rowScopes?.map(s=>({poolId:s.poolId,decisionIds:s.decisionIds??(s.decisionId?[s.decisionId]:[]),hash:s.hash,missingDecision:s.missingDecision}))};}
async function custodyRead(c:XqIntegrationConfig,p:XqIntegrationPort,description:z.infer<typeof DescribeOutput>,column:string,output:z.infer<typeof QueryOutput>){
 let stage='signed grant',locator:string|undefined,consumed=false,cleanupFailed=false;
 const execute=async()=>{
  if(description.custody?.provider!=='xq'||output.custody?.length!==1)throw new Error('Expected XQ grant');
  const bundle=output.custody[0]!;
  const claims=verifyGrant(bundle.grant,kid=>{const key=description.custody!.keys.find(k=>k.kid===kid);return key?createPublicKey({key,format:'jwk'}):undefined;});
  if(claims.iss!==c.OPINTEL_XQ_TEST_PROJECT_ID||claims.rcpt!==output.evidenceId||!claims.sub.startsWith('agent:'+c.OPINTEL_XQ_TEST_PROJECT_ID+':')||claims.custody.opintel_redeem_at!==new URL(`/mcp/v1/p/${c.OPINTEL_XQ_TEST_PROJECT_ID}`,c.OPINTEL_API_BASE_URL).href||claims.aud!=='xq'||claims.custody.provider!=='xq'||claims.custody.tenant!==description.custody.tenant||claims.exp<=Date.now()/1000||claims.iat>Date.now()/1000+30||claims.custody.provider_redeem_at!==c.OPINTEL_XQ_REDEEM_URL||claims.cols.length!==1||claims.cols[0]!==column||bundle.columns.length!==1||bundle.columns[0]!==column)throw new Error('Grant binding mismatch');
  locator=claims.custody.locator;
  stage='sealed response';
  if(output.rows.some(r=>r[0]!==null&&(typeof r[0]!=='string'||!r[0].startsWith(sealedPrefix))))throw new Error('Plaintext custody response');
  if(!output.rows.length)return {decryptedCells:0,nonNullCells:0};
  stage='recipient alias authorization';const token=await p.authorize(claims.sub);
  stage='XQ share retrieval';const first=await p.fetchShare(locator,claims.sub,token);consumed=true;
  let second:Buffer|undefined,key:Buffer|undefined,decryptedCells=0,nonNullCells=0;
  try{
   if(first.length!==32)throw new Error('Invalid XQ share');
   stage='Opintel redemption';const redeemed=releaseRedeemOutput.parse(content(await p.call('opintel.redeem',{grant:bundle.grant})));
   if(redeemed.receipt!==output.evidenceId||redeemed.grantId!==claims.jti)throw new Error('Redemption binding mismatch');
   second=Buffer.from(redeemed.share,'base64url');key=xorShares(first,second);
   stage='authenticated decryption';
   for(const [index,row] of output.rows.entries()){if(row[0]===null)continue;const value:unknown=unsealCell(String(row[0]),key,output.evidenceId,column,index);decryptedCells++;if(value!==null)nonNullCells++;}
   stage='single-use Opintel redemption';const repeat=response.parse(await p.call('opintel.redeem',{grant:bundle.grant}));
   if(repeat.isError!==true||repeat._meta?.code!=='forbidden'||repeat.structuredContent!==undefined)throw new Error('Repeat not explicitly refused');
  }finally{first.fill(0);second?.fill(0);key?.fill(0);}
  return {decryptedCells,nonNullCells};
 };
 let result:{decryptedCells:number;nonNullCells:number}|undefined;
 try{result=await execute();}catch{ /* Preserve only the fixed failure stage. */ }
 finally{if(locator&&!consumed)try{await p.revoke(locator);}catch{cleanupFailed=true;}}
 if(!result||cleanupFailed)throw new IntegrationFailure(stage,z.uuid().safeParse(output.evidenceId).success?output.evidenceId:undefined,cleanupFailed);
 return result;
}
/** Discover all exposed attributes. One bounded probe per field, plus raw-denial probes for aggregates. */
export async function runXqIntegration(c:XqIntegrationConfig,p:XqIntegrationPort):Promise<AgentReport>{
 const report:AgentReport={startedAt:new Date().toISOString(),finishedAt:'',projectId:c.OPINTEL_XQ_TEST_PROJECT_ID,objects:0,attributes:0,results:[],summary:[],sessionErrors:[],limitations:[
  'Discovery is restricted to this credential’s pool. Undecided, unreachable, inactive or unsupported attributes omitted by Describe cannot be enumerated or tested.',
  'Samples are at most three rows per attribute, not an exhaustive source scan. Each query has its own receipt; concurrent data or policy changes can affect comparisons.',
  'Clear, tokenized and masked probes verify delivery under the advertised treatment, not equality against privileged source data or mask correctness.',
  'Recorded row decisions are reported, not independently re-evaluated. Empty/all-null samples and policy-blocked aggregates are inconclusive.',
  'Custody checks verify signed grants, live XQ retrieval, authenticated decryption and Opintel single use; not dashboard corroboration, expiry, admin revocation or a second XQ fetch.',
 ]};
 try{
  const description=DescribeOutput.parse(content(await p.call('opintel.describe',{})));report.objects=description.objects.length;
  for(const object of description.objects){
   const attributes=[...object.columns,...object.withheld.map(name=>({name,type:'undisclosed',treatment:'withheld' as const}))];report.attributes+=attributes.length;
   for(const attribute of attributes){
    const probes=attribute.treatment==='aggregate_only'?['raw-refusal','aggregate'] as const:attribute.treatment==='withheld'?['raw-refusal'] as const:['sample'] as const;
    for(const probe of probes){
     const entry:ProbeResult={object:object.name,column:attribute.name,treatment:attribute.treatment,probe,outcome:'failed',detail:'query transport or response failed'};report.results.push(entry);
     try{
      if(attribute.treatment==='custody'&&(!c.OPINTEL_XQ_API_KEY||!c.OPINTEL_XQ_SENDER_ALIAS||!c.OPINTEL_XQ_SENDER_ACCESS_TOKEN||!c.OPINTEL_XQ_REDEEM_URL)){entry.outcome='inconclusive';entry.detail='XQ test credentials missing; custody query not issued';continue;}
      const field=quote(attribute.name),table=qualified(object.name),projection=probe==='aggregate'?`COUNT(${field}) AS ${field}`:field;
      const raw=response.parse(await p.call('opintel.query',{sql:`SELECT ${projection} FROM ${table} LIMIT 3`,maxRows:3}));
      if(raw.isError){
       const meta=z.object({code:z.string().optional(),cause:z.string().optional(),evidenceId:z.uuid().optional()}).parse(raw._meta??{});entry.receipt=meta.evidenceId;const code=errorCodeSchema.safeParse(meta.code);if(code.success)entry.code=code.data;
       const withheld=attribute.treatment==='withheld'&&(meta.code==='element_withheld'||meta.code==='object_unavailable'&&meta.cause==='all_withheld');
       const aggregate=attribute.treatment==='aggregate_only'&&meta.code==='unsupported_on_aggregate_only';
       if(raw.structuredContent!==undefined)throw new Error('Refusal returned data');
       entry.outcome=probe==='raw-refusal'&&(withheld||aggregate)?'passed':probe==='aggregate'&&aggregate?'inconclusive':'failed';
       entry.detail=entry.outcome==='passed'?'raw access explicitly refused':entry.outcome==='inconclusive'?'aggregate refused by disclosure policy':'query refused unexpectedly';continue;
      }
      const output=QueryOutput.parse(raw.structuredContent);Object.assign(entry,receiptMeta(output));
      if(probe==='raw-refusal'){entry.detail='DEFECT: raw access succeeded';continue;}
      if(output.columns.length!==1||output.columns[0]?.name!==attribute.name||output.rows.length>3||output.rows.some(r=>r.length!==1))throw new Error('Unexpected result shape');
      if(attribute.treatment==='custody'){
       if(!output.rows.length&&!output.custody?.length){entry.outcome='inconclusive';entry.detail='empty custody sample; no redemption exercised';continue;}
       const counts=await custodyRead(c,p,description,attribute.name,output);Object.assign(entry,counts);entry.outcome=counts.nonNullCells?'passed':'inconclusive';entry.detail=counts.nonNullCells?'XQ + Opintel shares decrypted; second Opintel redemption refused':'no non-null custody sample';
      }else{
       if(output.custody?.length||output.rows.some(r=>typeof r[0]==='string'&&r[0].startsWith(sealedPrefix)))throw new Error('Unexpected custody');
       if(probe==='aggregate'&&output.rows.some(r=>!z.union([z.number().int().nonnegative(),z.string().regex(/^\d+$/u)]).safeParse(r[0]).success))throw new Error('Invalid count');
       entry.nonNullCells=output.rows.filter(r=>r[0]!==null).length;entry.outcome=entry.nonNullCells?'passed':'inconclusive';entry.detail=entry.nonNullCells?(probe==='aggregate'?'aggregate delivered':'sample delivered under advertised treatment'):'empty or all-null sample';
      }
     }catch(error){entry.outcome='failed';entry.detail=error instanceof IntegrationFailure?'custody failed at '+error.stage+(error.cleanupFailed?'; cleanup unacknowledged':''):'query transport, identifier or response validation failed';}
    }
   }
  }
  if(!report.attributes)report.sessionErrors.push('No attributes discoverable; coverage is empty.');
 }catch{report.sessionErrors.push('MCP discovery failed; no complete attribute inventory.');}
 finally{try{await p.close();}catch{report.sessionErrors.push('MCP session close failed.');}report.finishedAt=new Date().toISOString();}
 report.summary=treatments.map(treatment=>{const rows=report.results.filter(r=>r.treatment===treatment);return {treatment,attributes:new Set(rows.map(r=>JSON.stringify([r.object,r.column]))).size,probes:rows.length,passed:rows.filter(r=>r.outcome==='passed').length,failed:rows.filter(r=>r.outcome==='failed').length,inconclusive:rows.filter(r=>r.outcome==='inconclusive').length};});
 return report;
}
export function reportExitCode(report:AgentReport){return report.sessionErrors.length||report.results.some(r=>r.outcome==='failed')?1:report.results.some(r=>r.outcome==='inconclusive')?2:0;}
export function reportMarkdown(report:AgentReport){
 const cell=(v:unknown)=>String(v??'—').replaceAll('|','\\|').replaceAll('\n',' ');
 return ['# Pool agent treatment report','',`Project: ${report.projectId}`,`Discovered: ${report.objects} objects, ${report.attributes} attributes.`,
 '', '| Treatment | Attributes | Probes | Passed | Failed | Inconclusive |','|---|---:|---:|---:|---:|---:|',...report.summary.map(s=>`| ${s.treatment} | ${s.attributes} | ${s.probes} | ${s.passed} | ${s.failed} | ${s.inconclusive} |`),
 ...treatments.flatMap(t=>['',`## ${t}`,'','| Object | Attribute | Probe | Outcome | Rows | Detail | Receipt |','|---|---|---|---|---:|---|---|',...report.results.filter(r=>r.treatment===t).map(r=>'| '+[r.object,r.column,r.probe,r.outcome,r.rows,r.detail+(r.code?' ('+r.code+')':''),r.receipt].map(cell).join(' | ')+' |')]),
 '', '## Coverage limits','',...report.limitations.map(s=>'- '+s),...report.sessionErrors.map(s=>'- ERROR: '+s),''].join('\n');
}
async function main(){
 try{
  const c=readIntegrationConfig(await readFile(new URL('../.env',import.meta.url),'utf8'));
  const {connectXqIntegration}=await import('./infrastructure/xq-integration.js');
  let port:XqIntegrationPort;try{port=await connectXqIntegration(c);}catch{throw new IntegrationFailure('MCP connection',undefined);}
  const report=await runXqIntegration(c,port);
  const {mkdir,writeFile}=await import('node:fs/promises'),{randomUUID}=await import('node:crypto');
  const directory=new URL('../tmp/review/pool-agent/'+randomUUID()+'/',import.meta.url);await mkdir(directory,{recursive:true});
  await writeFile(new URL('report.json',directory),JSON.stringify(report,null,2)+'\n',{mode:0o600});await writeFile(new URL('report.md',directory),reportMarkdown(report),{mode:0o600});
  console.info(`Discovered ${report.objects} objects / ${report.attributes} attributes. Report: ${directory.pathname}report.md`);
  console.table(report.summary);process.exitCode=reportExitCode(report);
 }catch(error){console.error(error instanceof IntegrationFailure?error.message:error instanceof Error&&error.message.startsWith('Set valid local configuration:')?error.message:'Pool agent could not start. Check local configuration; no values or credentials were printed.');process.exitCode=1;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)void main();

import {publicCode,publicCause} from './infrastructure/diagnostics.js';
import {z} from 'zod';
import {QueryOutput,DescribeOutput} from '../../src/shared/api/mcp.js';
import {releaseClaims,releaseRedeemOutput,sealedPrefix} from '../../src/shared/release-contract.js';
import {unsealColumns} from './infrastructure/unseal.js';
import {ShareRefused} from './infrastructure/device.js';
type QueryResult=z.infer<typeof QueryOutput>;
export const ResultFile=z.strictObject({version:z.literal(1),gateway:z.url(),project:z.uuid(),agentId:z.string(),treatments:z.record(z.string(),z.string()),result:QueryOutput});
export type ResultFile=z.infer<typeof ResultFile>;
export type McpCall=(name:string,args:Record<string,unknown>)=>Promise<{isError?:boolean;structuredContent?:unknown;_meta?:Record<string,unknown>;content?:unknown}>;
export function grantClaims(result:QueryResult){return (result.custody??[]).map(bundle=>{const claims=releaseClaims.parse(JSON.parse(Buffer.from(bundle.grant.split('.')[1]??'','base64url').toString('utf8')));if(claims.rcpt!==result.evidenceId||JSON.stringify(claims.cols)!==JSON.stringify(bundle.columns))throw new Error('Release grant does not match its result receipt and columns.');return {...bundle,claims};});}
export async function query(call:McpCall,sql:string){
 const reply=await call('opintel.query',{sql});if(reply.isError)throw new Error(`Query refused: ${publicCode(reply._meta?.code)} / ${publicCause(reply._meta?.cause)}.`);
 const result=QueryOutput.parse(reply.structuredContent),treatments:Record<string,string>={};
 for(const column of result.columns)treatments[column.name]='not reported';
 // Only a direct, unaliased projection from one qualified table can be labelled
 // using describe. An expression that reuses a column name is not a direct match.
 const identifier='(?:[A-Za-z_][A-Za-z0-9_]*|"(?:[^"\\\\]|"")+")',name=identifier+'(?:\\s*\\.\\s*'+identifier+')*';
 const direct=new RegExp('^\\s*SELECT\\s+(\\*|'+name+'(?:\\s*,\\s*'+name+')*)\\s+FROM\\s+('+name+')\\s*(?:WHERE\\b|ORDER\\s+BY\\b|LIMIT\\b|;?\\s*$)','iu').exec(sql);
 if(direct){
  const described=await call('opintel.describe',{});if(!described.isError){const description=DescribeOutput.parse(described.structuredContent),table=direct[2]!.replaceAll('"','').replace(/\s/gu,''),object=description.objects.find(o=>o.name===table);
   if(object)for(const column of result.columns){const found=object.columns.find(c=>c.name===column.name);if(found)treatments[column.name]=found.treatment;}
  }
 }
 for(const grant of grantClaims(result))for(const column of grant.columns)treatments[column]='custody';
 return {result,treatments};
}
export type RedemptionStep='lookup'|'K2 redeem'|'K1 fetch'|'unseal';
export async function redeem(file:ResultFile,call:McpCall,firstShare:(locator:string)=>Promise<Buffer>,onStep:(step:RedemptionStep)=>void=()=>{}){
 onStep('lookup');
 const grants=grantClaims(file.result);if(!grants.length)throw new Error('The result has no custody grants.');
 const shares:Array<{columns:string[];first:Buffer;second:Buffer}>=[];let released=0;
 try{
  for(const bundle of grants){
   onStep('K2 redeem');const response=await call('opintel.redeem',{grant:bundle.grant});
   if(response.isError)throw new ShareRefused('K2',`${publicCode(response._meta?.code)} / ${publicCause(response._meta?.cause)}: the grant is expired, revoked, already redeemed, or belongs to another credential; the server does not distinguish these causes.`);
   const reply=releaseRedeemOutput.parse(response.structuredContent);if(reply.receipt!==file.result.evidenceId||reply.grantId!==bundle.claims.jti)throw new Error('K2 response does not match the receipt and grant.');
   released++;const second=Buffer.from(reply.share,'base64url');let first:Buffer;
   try{onStep('K1 fetch');first=await firstShare(bundle.claims.custody.locator);}catch(error){second.fill(0);throw error;}
   shares.push({columns:bundle.columns,first,second});
  }
  // Fetch every share first. A refused share means no cell is decrypted.
  onStep('unseal');let rows=file.result.rows;for(const share of shares)rows=unsealColumns({...file.result,rows},share.columns,share.first,share.second);
  return {rows,grants:grants.map(g=>({id:g.claims.jti,columns:g.columns})),receiptState:'redeemed' as const};
 }catch(error){if(error instanceof Error&&released>0)error.message+=' Receipt state: redeemed for '+released+' grant(s) (K2 released); no plaintext was output.';throw error;}
 finally{for(const share of shares){share.first.fill(0);share.second.fill(0);}}
}
export function terminalText(text:string){return [...text].map(char=>{const point=char.codePointAt(0)??0;if(point>=32&&(point<127||point>159))return char;return char==='\r'?'\\r':char==='\n'?'\\n':char==='\t'?'\\t':'\\u'+point.toString(16).padStart(4,'0');}).join('');}
export function table(result:{columns:Array<{name:string}>;rows:unknown[][]},sealedColumns:readonly string[]=[]){
 const render=(value:unknown,index:number)=>{if(sealedColumns.includes(result.columns[index]?.name??'')&&typeof value==='string'&&value.startsWith(sealedPrefix))return value.slice(0,sealedPrefix.length+4)+'…';return terminalText(typeof value==='string'?value:JSON.stringify(value)??'undefined');};
 const rows=[result.columns.map(c=>terminalText(c.name)),...result.rows.map(row=>row.map(render))],widths=result.columns.map((_,i)=>Math.max(...rows.map(row=>[...(row[i]??'')].length)));
 return rows.map((row,index)=>row.map((value,i)=>value+' '.repeat(Math.max(0,widths[i]!-[...value].length))).join(' | ')+(index===0?'\n'+widths.map(w=>'-'.repeat(w)).join('-+-'):'' )).join('\n');
}

import {fork} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {parse} from 'dotenv';
import {it,vi} from 'vitest';
import {z} from 'zod';
import {reinsuranceConformance,definition} from '../../test/fixtures/reinsurance/conformance.js';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {QueryOutput} from '../../src/shared/api/mcp.js';
import {withTenant} from '../../src/platform/db/scope.js';
import {XqReleaseProvider} from '../../src/modules/release-custody/infrastructure/xq-provider.js';
import {PostgresEvidenceReader} from '../../src/modules/evidence/index.js';
import {RunId} from '../../src/shared/kernel/index.js';
import {releaseEvidenceMeaning} from '../../src/shared/release-contract.js';
import {unwrap} from '../../test/fixtures/query/fixture.js';

type Check={assertion:string;expected:unknown;actual:unknown;pass:boolean};
it('V-02: real certificate agents, MCP custody, recipient isolation and revoked K2',async()=>{
 if(process.env.OPINTEL_V02_LIVE!=='1')throw new Error('Explicit OPINTEL_V02_LIVE=1 required');
 await mkdir('tmp/review/v02-authorized-resume-2026-10-18',{recursive:true});
 await writeFile('tmp/review/v02-authorized-resume-2026-10-18/live-attempt.json',JSON.stringify({startedAt:new Date().toISOString()})+'\n',{flag:'wx'});
 const env=parse(await readFile('.env','utf8'));
 for(const name of ['OPINTEL_XQ_API_KEY','OPINTEL_XQ_TEAM_ID','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_REDEEM_URL','OPINTEL_CUSTODY_MASTER_KEY'])if(!env[name])throw new Error('Required live configuration missing: '+name);
 for(const [name,value] of Object.entries(env))if(name.startsWith('OPINTEL_XQ_')||name==='OPINTEL_CUSTODY_MASTER_KEY')process.env[name]=value;
 const report:{at:string;checks:Check[];associations:string[];exchanges:unknown[];calls?:unknown;failure?:string;packets:number;revocationFault:string}={at:new Date().toISOString(),checks:[],associations:[],exchanges:[],packets:0,revocationFault:'For assertion 6 only, inject an unavailable remote-revocation transport. Escrow and FetchKey remain real XQ. This exercises durable local refusal while K1 is still remotely available.'};
 const check=(assertion:string,actual:unknown,expected:unknown)=>{const pass=isDeepStrictEqual(actual,expected);report.checks.push({assertion,expected,actual,pass});if(!pass)throw new Error(assertion);};
 // Only General API key reaches the agent. No owner sender or dashboard token.
 const agent=fork('scripts/conformance/v02-agent.mjs',[],{execArgv:['--import','tsx'],env:{PATH:process.env.PATH,HOME:process.env.HOME,OPINTEL_XQ_API_KEY:env.OPINTEL_XQ_API_KEY},stdio:['ignore','ignore','ignore','ipc']});
 let sequence=0,exited=false;
 const pending=new Map<number,{resolve:(v:unknown)=>void;reject:(e:Error)=>void}>();
 agent.on('message',(message:unknown)=>{const m=z.object({id:z.number(),value:z.unknown().optional(),error:z.string().optional(),calls:z.unknown().optional()}).parse(message);const p=pending.get(m.id);pending.delete(m.id);if(m.error){report.calls=m.calls;p?.reject(new Error(m.error));}else p?.resolve(m.value);});
 agent.on('exit',()=>{exited=true;for(const p of pending.values())p.reject(new Error('Agent process exited'));pending.clear();});
 const command=(body:Record<string,unknown>)=>new Promise<unknown>((resolve,reject)=>{if(exited){reject(new Error('Agent process exited'));return;}const requestId=++sequence;pending.set(requestId,{resolve,reject});agent.send({...body,requestId});});
 const successful=z.object({ok:z.literal(true)});
 let f:Awaited<ReturnType<typeof reinsuranceConformance>>|undefined;
 const hashes=new Map<string,string>();
 const escrow=XqReleaseProvider.prototype.escrow;
 vi.spyOn(XqReleaseProvider.prototype,'escrow').mockImplementation(async function(this:XqReleaseProvider,share,recipient,ttl,singleUse,receipt){
  const hash=createHash('sha256').update(share).digest('hex');const locator=await escrow.call(this,share,recipient,ttl,singleUse,receipt);report.packets++;if(receipt)hashes.set(receipt,hash);return locator;
 });
 try{
  const exchange=async(certificateId:number,deviceName:string)=>{
   try{
    const raw=await command({op:'exchange',certificateId,deviceName});
    const parsed=z.object({ok:z.boolean(),status:z.number(),body:z.string().optional(),association:CertificateAssociation.optional()}).parse(raw);
    const body=parsed.body?Object.values(env).filter(v=>v.length>0).reduce((text,value)=>text.split(value).join('[redacted]'),parsed.body):'[successful secret-bearing body redacted]';
    report.exchanges.push({certificateId,deviceName,status:parsed.status,body});
    if(parsed.association)report.associations.push(parsed.association.recipientIdentifier.replace(/@.*$/u,'@<team>.trusted.local'));
    return parsed;
   }catch{report.exchanges.push({certificateId,deviceName,error:'Exchange or unwrap failed; inspect recorded HTTP calls'});return {ok:false,association:undefined};}
  };
  // Fresh exchanges explicitly authorized after the URL-guard failure.
  // Certificate 225 is diagnostic history only and must not be retried here.
  const poolBIdentity=await exchange(226,'opintelpoolb');
  if(!poolBIdentity.ok||!poolBIdentity.association)throw new Error('Certificate 226 unavailable in authorized resume');
  const poolAIdentity=await exchange(224,'opintelpoola');
  if(!poolAIdentity.ok||!poolAIdentity.association)throw new Error('Certificate 224 unavailable');
  const associations:CertificateAssociation[]=[poolAIdentity.association,poolBIdentity.association];
  f=await reinsuranceConformance({liveXqCustody:true,associations:Array.from({length:10},(_,i)=>associations[i<5?0:1]!)});
  check('Ten original credentials retain a public certificate association',f.agents.length,10);
  const before=await Promise.all(f.agents.map(a=>a.query('SELECT treaty_ref FROM bordereaux.bordereaux.policies ORDER BY treaty_ref')));
  check('Original ten-agent row filters',before.map(r=>QueryOutput.parse(r.structuredContent).rows),f.agents.map(a=>definition.policies.filter(p=>p.cedant===definition.cedants[a.poolIndex]).map(p=>[p.treaty_ref]).sort()));
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f!.pools[0],f!.objects.policies!.columns.get('risk_code')]));
  const poolB=await Promise.all(f.agents.slice(5).map(a=>a.query('SELECT risk_code FROM bordereaux.bordereaux.policies ORDER BY treaty_ref')));
  check('Pool B remains masked after Pool A custody decision',poolB.map(r=>QueryOutput.parse(r.structuredContent).rows),poolB.map(()=>definition.policies.filter(p=>p.cedant===definition.cedants[1]).map(p=>['••••'+p.risk_code.slice(-4)])));
  for(const i of [0,5]){const a=f.agents[i]!;successful.parse(await command({op:'connect',id:i,url:f.url.href,key:a.key,agentId:a.agentId}));}
  const expectedFor=(id:number)=>definition.policies.filter(p=>p.cedant===definition.cedants[id<5?0:1]).sort((a,b)=>a.treaty_ref.localeCompare(b.treaty_ref));
  // A B-addressed custody result is required for the reverse cross-pool check.
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody',mask_kind=NULL WHERE pool_id=$1 AND element_id=$2",[f!.pools[1],f!.objects.policies!.columns.get('risk_code')]));
  const make=async(id:number,result:string)=>{
   const expected=expectedFor(id);
   const reply=z.object({ok:z.boolean(),output:QueryOutput.optional(),grantId:z.string().optional(),code:z.string().optional()}).parse(await command({op:'query',id,result,sql:'SELECT * FROM bordereaux.bordereaux.policies ORDER BY treaty_ref'}));
   check(result+': query succeeds',reply.ok,true);if(!reply.output||!reply.grantId)throw new Error('Missing custody result');const o=reply.output;
   check(result+': one grant',o.custody?.length,1);
   const names=o.columns.map(c=>c.name),rows=o.rows.map(r=>Object.fromEntries(names.map((n,i)=>[n,r[i]])));
   check(result+': sealed column',rows.every(r=>typeof r.risk_code==='string'&&r.risk_code.startsWith('opintelsealed:v1:')),true);
   check(result+': other treatments unaffected',rows.map(r=>[r.treaty_ref,r.insured_name,r.broker_reference]),expected.map(p=>[p.treaty_ref,'••••'+p.insured_name.slice(-4),id<5?p.broker_reference:undefined]));
   check(result+': tokenized and withheld unaffected',rows.every(r=>typeof r.policy_id==='string'&&r.policy_id.startsWith('v1_policy_'))&&!names.includes('underwriter_note'),true);
   return {output:o,grantId:reply.grantId};
  };
  for(const [id,recipient,nonRecipient,result] of [[0,224,226,'pool-a'],[5,226,224,'pool-b']] as const){
   const r=await make(id,result);
   // Refusal first: cannot confuse rejection with single-use consumption.
   const denied=z.object({ok:z.boolean(),status:z.number()}).parse(await command({op:'fetch',certificateId:nonRecipient,result}));
   check(result+': XQ non-recipient refusal',denied,{ok:false,status:403});
   const redeemed=z.object({ok:z.boolean(),meaning:z.string().optional()}).parse(await command({op:'redeem',result}));check(result+': K2 release',redeemed,{ok:true,meaning:releaseEvidenceMeaning});
   check(result+': second K2 release refused',z.object({ok:z.boolean()}).parse(await command({op:'redeem',result})).ok,false);
   const fetched=z.object({ok:z.boolean(),status:z.number(),bytes:z.number().optional(),digest:z.string().optional()}).parse(await command({op:'fetch',certificateId:recipient,result}));
   check(result+': own XQ share matches escrow',{ok:fetched.ok,status:fetched.status,bytes:fetched.bytes,matches:fetched.digest===hashes.get(r.output.evidenceId)},{ok:true,status:200,bytes:32,matches:true});
   check(result+': two shares unseal; neither alone does',await command({op:'unseal',result,column:'risk_code',expected:expectedFor(id).map(p=>p.risk_code)}),{matches:true,firstAloneRefused:true,secondAloneRefused:true});
   const [stored]=await withTenant(f.ctx,tx=>tx.query<{at:string}>('SELECT started_at::text AS at FROM query_run WHERE id=$1',[r.output.evidenceId]));
   const receipt=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(r.output.evidenceId),stored!.at));
   const text=JSON.stringify(receipt);
   check(result+': receipt has no fixture literals',definition.policies.some(p=>[p.risk_code,p.policy_id,p.insured_name,p.broker_reference].some(v=>text.includes(v))),false);
   check(result+': receipt includes explicit non-claim',text.includes(releaseEvidenceMeaning),true);
   const events=await withTenant(f.ctx,tx=>tx.query<{at:Date;kind:string}>('SELECT occurred_at AS at,kind FROM release_event WHERE grant_id=$1',[r.grantId]));
   check(result+': exactly one timed Opintel release',events.filter(e=>e.kind==='redeemed'&&Number.isFinite(new Date(e.at).getTime())).length,1);
   check(result+': no provider-read claim',events.some(e=>e.kind==='provider_redeemed'),false);
  }
  const revoked=await make(0,'revoked');
  // Explicit fault injection ONLY on remote cleanup, to establish the requested
  // residual-K1 condition without mocking escrow, fetching, sealing or redemption.
  const cleanup=vi.spyOn(XqReleaseProvider.prototype,'revoke').mockRejectedValue(new Error('V-02 injected remote cleanup unavailable'));
  try{unwrap(await f.release!.revoke(f.ctx,revoked.grantId,f.ctx.userId));}finally{cleanup.mockRestore();}
  const [state]=await withTenant(f.ctx,tx=>tx.query('SELECT share,state,escrow_revoked FROM release_grant WHERE id=$1',[revoked.grantId]));
  check('Revocation disposes K2; remote cleanup pending',state,{share:null,state:'revoked',escrow_revoked:false});
  check('Revoked redemption refused',z.object({ok:z.boolean()}).parse(await command({op:'redeem',result:'revoked'})).ok,false);
  const residual=z.object({ok:z.boolean(),status:z.number(),digest:z.string().optional()}).parse(await command({op:'fetch',certificateId:224,result:'revoked'}));
  check('K1 still fetchable after local revocation',{ok:residual.ok,status:residual.status,matches:residual.digest===hashes.get(revoked.output.evidenceId)},{ok:true,status:200,matches:true});
  check('One real type-8 packet per custody result',report.packets,3);
 }catch(error){const message=error instanceof Error?error.message:'Unclassified failure';report.failure=Object.values(env).filter(v=>v.length>0).reduce((text,value)=>text.split(value).join('[redacted]'),message).replace(/[A-Za-z0-9._+-]+@[A-Za-z0-9.-]+/gu,'[address redacted]').replace(/[A-Za-z0-9+/_-]{43,}={0,2}/gu,'[opaque value redacted]');throw new Error('V-02 stopped: '+report.failure);}
 finally{
  try{report.calls=await command({op:'calls'});}catch{ /* Child failure already recorded. */ }
  await mkdir('tmp/review/v02-authorized-resume-2026-10-18',{recursive:true});await writeFile('tmp/review/v02-authorized-resume-2026-10-18/report.json',Object.entries(env).filter(([key,value])=>value.length>0&&(key.startsWith('OPINTEL_XQ_')||key==='OPINTEL_CUSTODY_MASTER_KEY')).reduce((text,[,value])=>text.split(value).join('[redacted]'),JSON.stringify(report,null,2))+'\n');
  try{await command({op:'close'});}finally{agent.kill();await f?.close();vi.restoreAllMocks();}
 }
});

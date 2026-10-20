import {isDeepStrictEqual} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
import {expect,it} from 'vitest';
import {z} from 'zod';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {withTenant} from '../src/platform/db/scope.js';
import {PostgresEvidenceReader} from '../src/modules/evidence/index.js';
import {RunId} from '../src/shared/kernel/index.js';
import {PostgresDashboardReader} from '../src/modules/tenancy/infrastructure/dashboard.js';
import {definition,reinsuranceConformance} from './fixtures/reinsurance/conformance.js';
import {unwrap} from './fixtures/query/fixture.js';

type Check={assertion:string;expected:unknown;actual:unknown;pass:boolean};
it('V-01: ten credentialed agents, two cedants, real MCP and Engine; expectations from reinsurance definition',async()=>{
 const checks:Check[]=[];
 const check=(assertion:string,actual:unknown,expected:unknown)=>{checks.push({assertion,expected,actual,pass:isDeepStrictEqual(actual,expected)});expect.soft(actual,assertion).toEqual(expected);};
 const f=await reinsuranceConformance();
 const policies=definition.cedants.map(cedant=>definition.policies.filter(row=>row.cedant===cedant));
 const claims=definition.cedants.map(cedant=>definition.claims.filter(row=>row.cedant===cedant));
 const matched=definition.cedants.map((_,i)=>claims[i]!.filter(c=>policies[i]!.some(p=>p.policy_id===c.policy_id)));
 const receipts:Array<{id:string;agentId:string;credentialId:string;pool:string;batch:string;success:boolean;counts:Record<string,number>}> = [];
 const forbiddenLiterals=[...definition.cedants,...definition.policies.flatMap(p=>[p.policy_id,p.insured_name,p.underwriter_note,p.risk_code,p.broker_reference])];
 try{
  check('Fixture has rows selected by neither pool',definition.policies.some(p=>!definition.cedants.includes(p.cedant))&&definition.claims.some(p=>!definition.cedants.includes(p.cedant)),true);
  check('Fixture filters are nonempty proper subsets',policies.every(rows=>rows.length>0&&rows.length<definition.policies.length)&&claims.every(rows=>rows.length>0&&rows.length<definition.claims.length),true);
  check('Fixture has shared and one-sided entities in both cedants',matched.every((rows,i)=>rows.length>0&&rows.length<policies[i]!.length&&rows.length<claims[i]!.length),true);
  const batches=[
   {name:'policy listing / pool isolation / masks / withholding',sql:'SELECT * FROM bordereaux.bordereaux.policies ORDER BY treaty_ref',kind:'policies'},
   {name:'claim listing / scope',sql:'SELECT claim_id,policy_id,loss_date FROM claims.bordereaux.claims ORDER BY claim_id',kind:'claims'},
   {name:'tokenized cross-source join',sql:'SELECT c.claim_id,p.policy_id,p.treaty_ref FROM bordereaux.bordereaux.policies p JOIN claims.bordereaux.claims c ON p.policy_id=c.policy_id ORDER BY c.claim_id',kind:'join'},
   {name:'aggregate-only count and sum',sql:'SELECT COUNT(claim_amount) AS claim_count,SUM(claim_amount) AS total_loss FROM claims.bordereaux.claims',kind:'aggregate'},
   {name:'bound is not decided',sql:'SELECT broker_reference FROM bordereaux.bordereaux.policies ORDER BY broker_reference',kind:'undecided'},
   {name:'aggregate-only row listing refused',sql:'SELECT claim_amount FROM claims.bordereaux.claims',kind:'raw'},
   {name:'withheld explicit reference refused',sql:'SELECT underwriter_note FROM bordereaux.bordereaux.policies',kind:'withheld'},
   {name:'scoped reference without applicable predicate',sql:'SELECT treaty_ref FROM bordereaux.bordereaux.treaty_reference',kind:'missing'},
  ];
  for(const batch of batches){
   let active=0,peak=0;
   const responses=await Promise.all(f.agents.map(async agent=>{active++;peak=Math.max(peak,active);try{return {agent,response:await agent.query(batch.sql)};}finally{active--;}}));
   check(`${batch.name}: ten concurrent client requests`,peak,10);
   const ids:string[]=[];
   for(const {agent,response} of responses){
    const prefix=`${batch.name} / ${agent.agentId}`,index=agent.poolIndex;
    const error=batch.kind==='raw'?'unsupported_on_aggregate_only':batch.kind==='withheld'?'element_withheld':batch.kind==='undecided'&&index===1?'entitlement_missing':null;
    check(`${prefix}: status`,response.isError===true,error!==null);
    if(response.isError===true&&!error)checks.push({assertion:`${prefix}: unexpected refusal`,expected:'success',actual:response._meta,pass:false});
    const decoded=QueryOutput.safeParse(response.structuredContent),meta=response._meta;
    const id=decoded.success?decoded.data.evidenceId:typeof meta?.evidenceId==='string'?meta.evidenceId:undefined;
    check(`${prefix}: receipt exists`,typeof id,'string');if(id)ids.push(id);
    const counts:Record<string,number>={};
    if(error){
     check(`${prefix}: refusal code`,meta?.code,error);check(`${prefix}: no delivered result`,response.structuredContent,undefined);
    }else{
     check(`${prefix}: response contract`,decoded.success,true);
     if(decoded.success){
      const output=decoded.data,names=output.columns.map(c=>c.name);
      const objects=output.rows.map(row=>Object.fromEntries(names.map((name,i)=>[name,row[i]])));
      if(batch.kind==='policies'){
       counts[f.objects.policies!.id]=policies[index]!.length;
       check(`${prefix}: entitled rows`,output.rows.length,policies[index]!.length);
       check(`${prefix}: exact selected treaty/risk/name rows`,objects.map(row=>[row.treaty_ref,row.risk_code,row.insured_name,row.line_of_business]).sort(),policies[index]!.map(p=>[p.treaty_ref,index===0?p.risk_code:'••••'+p.risk_code.slice(-4),'••••'+p.insured_name.slice(-4),p.line_of_business]).sort());
       check(`${prefix}: tokenized identifiers`,objects.every(row=>typeof row.policy_id==='string'&&/^v1_policy_/.test(row.policy_id)),true);
       check(`${prefix}: raw identifiers absent`,objects.some(row=>definition.policies.some(p=>p.policy_id===row.policy_id)),false);
       check(`${prefix}: withheld absent`,names.includes('underwriter_note'),false);
       check(`${prefix}: withholding disclosed`,z.array(z.object({type:z.string(),text:z.string().optional()})).parse(response.content).some(c=>c.type==='text'&&typeof c.text==='string'&&c.text.includes('underwriter_note')&&c.text.includes('withheld')),true);
       check(`${prefix}: undecided absent only in B`,names.includes('broker_reference'),index===0);
      }else if(batch.kind==='claims'){
       counts[f.objects.claims!.id]=claims[index]!.length;
       check(`${prefix}: exact cedant rows`,objects.map(r=>[r.claim_id,r.loss_date]),claims[index]!.map(c=>[c.claim_id,c.loss_date]).sort());
       check(`${prefix}: source-two tokens`,objects.every(row=>typeof row.policy_id==='string'&&/^v1_policy_/.test(row.policy_id)),true);
      }else if(batch.kind==='join'){
       counts[f.objects.policies!.id]=policies[index]!.length;counts[f.objects.claims!.id]=claims[index]!.length;
       check(`${prefix}: exact joined entities`,objects.map(r=>[r.claim_id,r.treaty_ref]),matched[index]!.map(c=>[c.claim_id,policies[index]!.find(p=>p.policy_id===c.policy_id)!.treaty_ref]).sort());
       check(`${prefix}: joined keys remain tokens`,objects.every(row=>typeof row.policy_id==='string'&&/^v1_policy_/.test(row.policy_id)),true);
      }else if(batch.kind==='aggregate'){
       counts[f.objects.claims!.id]=claims[index]!.length;
       check(`${prefix}: count and unequal-valued sum`,output.rows.map(r=>r.map(String)),[[String(claims[index]!.length),String(claims[index]!.reduce((sum,c)=>sum+c.claim_amount,0))]]);
       check(`${prefix}: no individual amount column`,names,['claim_count','total_loss']);
      }else if(batch.kind==='undecided'){
       counts[f.objects.policies!.id]=policies[index]!.length;
       check(`${prefix}: A-only field`,output.rows,policies[index]!.map(p=>[p.broker_reference]).sort());
      }else if(batch.kind==='missing'){
       counts[f.objects.treaty_reference!.id]=0;
       check(`${prefix}: zero rows without error`,output.rows,[]);
       check(`${prefix}: missing decision only in B`,output.rowScopes?.[0]?.missingDecision,index===1);
      }
      check(`${prefix}: receipt returned counts`,Object.fromEntries((output.rowScopes??[]).map(s=>[s.objectId,s.returnedRows])),counts);
      check(`${prefix}: receipt has this pool only`,output.rowScopes?.every(s=>s.poolId===agent.pool),true);
      check(`${prefix}: scope receipt has no fixture literals`,forbiddenLiterals.some(value=>JSON.stringify(output.rowScopes).includes(value)),false);
     }
    }
    if(id)receipts.push({id,agentId:agent.agentId,credentialId:agent.credentialId,pool:agent.pool,batch:batch.name,success:!error,counts});
   }
   check(`${batch.name}: ten distinct receipts`,new Set(ids).size,10);
  }
  check('All 80 requests have distinct receipts',new Set(receipts.map(r=>r.id)).size,80);
  for(const receipt of receipts){
   const rows=await withTenant(f.ctx,tx=>tx.query<{agent_id:string;credential_id:string;pool_id:string;at:string;source_plan:Record<string,unknown>;outcome:{kind:string}}>('SELECT r.agent_id,r.credential_id,r.pool_id,r.started_at::text AS at,c.source_plan,c.outcome FROM query_run r JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.id=$1',[receipt.id]));
   check(`${receipt.batch}/${receipt.agentId}: one stored completion`,rows.length,1);
   const row=rows[0];if(!row)continue;
   check(`${receipt.batch}/${receipt.agentId}: no caller/pool interleaving`,[row.agent_id,row.credential_id,row.pool_id],[receipt.agentId,receipt.credentialId,receipt.pool]);
   check(`${receipt.batch}/${receipt.agentId}: stored plan has no fixture literals`,forbiddenLiterals.some(value=>JSON.stringify(row.source_plan).includes(value)),false);
   const detail=unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(receipt.id),row.at));
   check(`${receipt.batch}/${receipt.agentId}: complete receipt contains no fixture literals`,forbiddenLiterals.some(value=>JSON.stringify(detail).includes(value)),false);
   if(receipt.success){
    const scopes=QueryOutput.shape.rowScopes.parse(row.source_plan.rowScopes);
    check(`${receipt.batch}/${receipt.agentId}: persisted returned counts`,Object.fromEntries((scopes??[]).map(s=>[s.objectId,s.returnedRows])),receipt.counts);
   }else check(`${receipt.batch}/${receipt.agentId}: refused evidence`,row.outcome.kind,'refused');
  }
  const findings=unwrap(await new PostgresDashboardReader().feed(f.ctx,null,100)).filter(finding=>finding.kind==='row_scope_missing');
  check('Exactly one Needs You finding, for B',findings.map(finding=>finding.poolId),[f.pools[1]]);
 }finally{
  await mkdir('test-results/v01',{recursive:true});
  await writeFile('test-results/v01/report.json',JSON.stringify({fixture:'src/modules/sources/demo/reinsurance.json#conformance',agents:10,pools:2,expected:{policies:policies.map(r=>r.length),claims:claims.map(r=>r.length),joins:matched.map(r=>r.length),sums:claims.map(rows=>rows.reduce((sum,r)=>sum+r.claim_amount,0))},checks},null,2)+'\n');
  await f.close();
 }
},180000);

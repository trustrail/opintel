import type {CertificateAssociation} from '../../../src/shared/api/certificate-association.js';
import {randomUUID} from 'node:crypto';
import pack from '../../../src/modules/sources/demo/reinsurance.json' with {type:'json'};
import {withTenant,withPlatform} from '../../../src/platform/db/scope.js';
import {ElementId,ObjectId,PoolId,SourceId} from '../../../src/shared/kernel/index.js';
import {BulkEntitlementService,PostgresBulkEntitlements} from '../../../src/modules/entitlements/index.js';
import {PostgresRowDecisions} from '../../../src/modules/entitlements/infrastructure/row-decisions.js';
import {PostgresEvidenceWriter} from '../../../src/modules/evidence/index.js';
import {PoolKeyCreationResponse} from '../../../src/shared/api/pool-keys.js';
import {queryFixture,unwrap} from '../query/fixture.js';

export const definition=pack.conformance;
export async function reinsuranceConformance(options:{liveXqCustody?:boolean;associations?:CertificateAssociation[]}={}){
 const f=await queryFixture(new PostgresEvidenceWriter(),{liveXqCustody:options.liveXqCustody,sourceLimits:{maxConnectionsPerSource:10,statementTimeoutMs:10000,operationTimeoutMs:15000}});
 try{
  // Reuse only the real HTTP/MCP/Engine harness. Its generic warehouse is not
  // reachable by either conformance pool; data below extends the existing pack.
  unwrap(await f.bindings.set(f.ctx,f.pool,f.source,false));
  const second=await f.issue('Cedant 02'),pools=[f.pool,PoolId(second.poolId)];
  await withTenant(f.ctx,async tx=>{
   await tx.query("UPDATE pool SET name='Cedant 01' WHERE id=$1",[f.pool]);
  });
  await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query,concurrencyPerPool}','5'::jsonb) WHERE id=$1",[f.ctx.projectId]));
  type Column={name:string;type?:'INTEGER'|'DATE';treatment:'clear'|'tokenized'|'masked'|'aggregate_only'|'withheld'|'pool_specific'|'a_only'};
  const policyColumns:Column[]=[{name:'cedant',treatment:'clear'},{name:'policy_id',treatment:'tokenized'},{name:'insured_name',treatment:'masked'},{name:'treaty_ref',treatment:'clear'},{name:'line_of_business',treatment:'clear'},{name:'underwriter_note',treatment:'withheld'},{name:'broker_reference',treatment:'a_only'},{name:'risk_code',treatment:'pool_specific'}];
  const claimColumns:Column[]=[{name:'cedant',treatment:'clear'},{name:'policy_id',treatment:'tokenized'},{name:'claim_id',treatment:'clear'},{name:'loss_date',type:'DATE',treatment:'clear'},{name:'claim_amount',type:'INTEGER',treatment:'aggregate_only'}];
  const bulk=new BulkEntitlementService(new PostgresBulkEntitlements()),rowDecisions=new PostgresRowDecisions();
  const objects:Record<string,{id:ObjectId;columns:Map<string,ElementId>} >={};
  const policySource=SourceId(randomUUID()),claimSource=SourceId(randomUUID());
  for(const [source,alias] of [[policySource,'bordereaux'],[claimSource,'claims']] as const){
   await withTenant(f.ctx,tx=>tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,$3,$3,'postgres','secret://test/source','connected')",[source,f.ctx.projectId,alias]));
   for(const pool of pools)unwrap(await f.bindings.set(f.ctx,pool!,source,true));
  }
  for(const table of [
   {source:policySource,name:'policies',columns:policyColumns,rows:definition.policies},
   {source:claimSource,name:'claims',columns:claimColumns,rows:definition.claims},
   {source:policySource,name:'treaty_reference',columns:[{name:'treaty_ref',treatment:'clear'}] as Column[],rows:definition.treaty_reference},
  ]){
   await f.db(`CREATE TABLE ${f.schema}.${table.name}(${table.columns.map(c=>`${c.name} ${c.type??'text'}`).join(',')})`);
   for(const row of table.rows){const values=table.columns.map(c=>(row as Record<string,unknown>)[c.name]);await f.db(`INSERT INTO ${f.schema}.${table.name} VALUES(${values.map((_,i)=>'$'+(i+1)).join(',')})`,values);}
   await f.db(`ANALYZE ${f.schema}.${table.name}`);
   const object=await withTenant(f.ctx,async tx=>{
    const [o]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,$3,$4,'table','bordereaux',$4) RETURNING id",[f.ctx.projectId,table.source,f.schema,table.name]);
    const columns=new Map<string,ElementId>();
    for(const [ordinal,c] of table.columns.entries()){
     const id=ElementId(randomUUID());columns.set(c.name,id);
     await tx.query('INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal,token_domain,case_insensitive) VALUES($1,$2,$3,$4,$5,$4,$6,$7,$8,false)',[id,f.ctx.projectId,o!.id,c.name,c.type==='INTEGER'?'int4':c.type==='DATE'?'date':'text',c.type??'VARCHAR',ordinal,c.name==='policy_id'?'policy':null]);
    }
    if(table.name==='claims')await tx.query('UPDATE catalog_element SET contributor_key=true WHERE id=$1',[columns.get('policy_id')]);
    return {id:ObjectId(o!.id),columns};
   });objects[table.name]=object;
   for(const [poolIndex,pool] of pools.entries()){
    for(const c of table.columns){
     if(c.treatment==='a_only'&&poolIndex===1)continue;
     const treatment=c.treatment==='a_only'?'clear':c.treatment==='pool_specific'?(poolIndex===0?'clear':'masked'):c.treatment;
     const result=unwrap(await bulk.execute(f.ctx,pool!,{projectId:f.ctx.projectId,elementIds:[object.columns.get(c.name)!],treatment,maskKind:treatment==='masked'?'last4':null,justification:'V-01 synthetic reinsurance conformance.'},randomUUID(),'v01'));
     if(result.status!==200)throw new Error('Conformance fixture decision was rejected');
    }
    if(table.name!=='treaty_reference')unwrap(await rowDecisions.save(f.ctx,pool!,object.id,`cedant = '${definition.cedants[poolIndex]!}'`));
   }
  }
  // An object becomes scoped only after an explicit row decision. A denies all;
  // B has no decision: exactly one missing-decision finding is expected for B.
  unwrap(await rowDecisions.save(f.ctx,pools[0]!,objects.treaty_reference!.id,"treaty_ref = 'NO_SUCH_TREATY'"));
  const agents=[];
  for(let i=0;i<10;i++){
   const poolIndex=i<5?0:1,pool=pools[poolIndex]!,agentId=`v01-cedant-${poolIndex+1}-agent-${i%5+1}`;
   const issued=PoolKeyCreationResponse.parse(unwrap(await f.keys.execute(f.ctx,{kind:'issue',poolId:pool,label:agentId,...(options.associations?{certificateAssociation:options.associations[i]}:{})},randomUUID())));
   if(!issued.keyShown||!issued.credentialId)throw new Error('Missing conformance credential');
   agents.push({poolIndex,pool,agentId,credentialId:issued.credentialId,key:issued.key,...await f.connect(issued.key,agentId)});
  }
  return {...f,pools,objects,agents};
 }catch(error){await f.close();throw error;}
}

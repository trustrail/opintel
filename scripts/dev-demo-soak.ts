/** Development seeding only. The soak never imports this module. Extends the
 * existing demo project and opintel_demo database with the V-01 definition. */
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {sidecarDevDirectory} from './sidecar-dev.js';
import {settleDevelopmentSource} from './dev-demo-readiness.js';
import {Client} from 'pg';
import {withTenant} from '../src/platform/db/scope.js';
import {EnvironmentSecretStore,SecretRef} from '../src/platform/secrets/index.js';
import {PoolId,ElementId,ObjectId,type ProjectId,type UserId,type EngineId,type SourceId} from '../src/shared/kernel/index.js';
import {CredentialId,PoolKeyService,PostgresPoolKeys,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings} from '../src/modules/pools/index.js';
import {RelationshipOutbox} from '../src/modules/tenancy/index.js';
import {BulkEntitlementService,PostgresBulkEntitlements} from '../src/modules/entitlements/index.js';
import type {SpiceDbAuthorizationPort} from '../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import type {EngineRegistry} from '../src/modules/engines/index.js';
import {custodyAvailability} from '../src/modules/release-custody/index.js';
import {createSourceRuntime} from '../src/modules/sources/infrastructure/source-runtime.js';
import {PoolKeyCreationResponse} from '../src/shared/api/pool-keys.js';
import {demoManifest,certificateMapping,certificateForAgent,type DemoManifest} from './soak/manifest.js';
import pack from '../src/modules/sources/demo/reinsurance.json' with {type:'json'};
import {demoTables,declaredContributorKey,declaredTreatment,declaredFilter,generateSpecification} from './demo-soak-definition.js';
import {PostgresRowDecisions} from '../src/modules/entitlements/infrastructure/row-decisions.js';
import type {Result} from '../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
const definition=pack.conformance,quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
export async function seedDemoSoak(ctx:{projectId:ProjectId;userId:UserId},registry:EngineRegistry,engineId:EngineId,auth:SpiceDbAuthorizationPort,associationFile:string|undefined,file='tmp/dev-demo/soak.json'){
 if(!associationFile)throw new Error('--soak requires --soak-associations pointing to the four-device public mapping (no certificate keys)');
 certificateMapping.parse(JSON.parse(await readFile(associationFile,'utf8')));
 const {custodyAgents}=await import('./soak/custody.js');
 const device=custodyAgents(associationFile,process.env.OPINTEL_XQ_API_KEY??'',()=>{},state=>{console.log('Certificate',state.certificateId,state.ok?'exchanged':'unavailable',state.reason??'',state.status??'',state.body??'');});
 const associations=await device.associations().finally(()=>device.close());
 const availability=await custodyAvailability(ctx.projectId);
 if(!availability.available||availability.configuration?.provider!=='xq')throw new Error('Configure this demo project’s XQ custody provider and pass its connection check in Settings before --soak');
 const associationFor=(pool:number,index:number)=>{const slot=certificateForAgent(pool,index);return associations.find(v=>v.certificateId===slot.certificateId);};
 const hash=createHash('sha256').update(JSON.stringify(demoTables)).digest('hex');const legacyHash=createHash('sha256').update(JSON.stringify(definition)).digest('hex');
 let manifest:DemoManifest={version:1,projectId:ctx.projectId,definitionHash:hash,agents:[],objects:{}};
 try{const st=await stat(file);if(st.mode&0o077)throw new Error('Credential manifest must have mode 600');manifest=demoManifest.parse(JSON.parse(await readFile(file,'utf8')));if(manifest.projectId!==ctx.projectId||![hash,legacyHash].includes(manifest.definitionHash))throw new Error('Existing soak manifest is for another project or fixture version');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const persist=async()=>{await writeFile(file+'.next',JSON.stringify(manifest,null,2)+'\n',{mode:0o600});await rename(file+'.next',file);};
 // Explicit source-database bootstrap scope, never the application's metadata DB.
 // Existing rows must equal the published fixture: do not overwrite operator edits.
 const source=new Client({connectionString:await new EnvironmentSecretStore().resolve(SecretRef('secret://demo/postgres'))});
 await source.connect();
 const tables=demoTables;
 try{await source.query('BEGIN');
  for(const table of tables){const columns=Object.keys(table.rows[0]!);await source.query(`CREATE SCHEMA IF NOT EXISTS ${quote(table.schema)}`);
   await source.query(`CREATE TABLE IF NOT EXISTS ${quote(table.schema)}.${quote(table.name)} (${columns.map(name=>quote(name)+' '+(name==='claim_amount'?'integer':name==='loss_date'?'date':'text')).join(',')})`);
   const existing=await source.query(`SELECT ${columns.map(c=>c==='loss_date'?quote(c)+'::text AS '+quote(c):quote(c)).join(',')} FROM ${quote(table.schema)}.${quote(table.name)}`);
   if(!existing.rows.length)for(const row of table.rows){await source.query(`INSERT INTO ${quote(table.schema)}.${quote(table.name)} VALUES (${columns.map((_,i)=>'$'+(i+1)).join(',')})`,columns.map(c=>(row as Record<string,unknown>)[c]));}
   else{const canonical=(rows:Record<string,unknown>[])=>rows.map(r=>JSON.stringify(columns.map(c=>r[c]))).sort().join('\n');if(canonical(existing.rows as Record<string,unknown>[])!==canonical([...table.rows]))throw new Error('Demo table differs from the V-01 definition: '+table.name+'; no rows were replaced');}
   await source.query(`ANALYZE ${quote(table.schema)}.${quote(table.name)}`);
  }await source.query('COMMIT');
 }catch(error){await source.query('ROLLBACK');throw error;}finally{await source.end();}
 const runtime=createSourceRuntime(registry),outbox=new RelationshipOutbox();
 const keys=new PoolKeyService(new PostgresPoolKeys(),new PostgresAgentPresence({publish:async()=>{}}));
 const bulk=new BulkEntitlementService(new PostgresBulkEntitlements()),bindings=new PoolBindingService(new PostgresPoolBindings(outbox),outbox,auth),rows=new PostgresRowDecisions();
 try{
  const sources:Array<{id:SourceId;exposed_alias:string;status:string}>=[];
  for(const [schema,name] of [['soak_policies','Reinsurance Policies'],['soak_claims','Reinsurance Claims'],['soak_recoveries','Reinsurance Recoveries']] as const){
   let [item]=await withTenant(ctx,tx=>tx.query<{id:import('../src/shared/kernel/index.js').SourceId;exposed_alias:string;status:string;credential_ref:string;engine_id:string}>("SELECT id,exposed_alias,status,credential_ref,engine_id FROM data_source WHERE name=$1 AND status<>'archived'",[name]));
   if(!item){const created=unwrap(await runtime.create(ctx,{name,kind:'postgres',credentialRef:'secret://demo/postgres',engineId,includeSchemas:[schema],samplingConsent:false,receivesLandings:false,landingStrategy:null}));unwrap(await runtime.idle());item={id:created.id,exposed_alias:created.exposedAlias,status:created.status,credential_ref:'secret://demo/postgres',engine_id:engineId};}
   if(item.credential_ref!=='secret://demo/postgres'||item.engine_id!==engineId)throw new Error(name+' is not the expected development source; refusing to modify it');
   await settleDevelopmentSource(registry,ctx,engineId,item.id,join(sidecarDevDirectory,'service.json'));
   const [connected]=await withTenant(ctx,tx=>tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1',[item!.id]));
   if(connected?.status!=='connected')throw new Error(name+' is not connected; inspect the source in the console');
   item.status=connected.status;
   sources.push(item);
  }
  for(const poolIndex of [0,1]){
   const name=poolIndex===0?'Cedant 01':'Cedant 02',association=associationFor(poolIndex,0);
   let [pool]=await withTenant(ctx,tx=>tx.query<{id:PoolId}>('SELECT id FROM pool WHERE name=$1',[name]));
   if(!pool){const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'create',name,certificateAssociation:association},randomUUID())));if(!created.keyShown||!created.credentialId)throw new Error('Pool creation did not return its credential');pool={id:PoolId(created.poolId)};manifest.agents.push({poolIndex,pool:pool.id,credentialId:created.credentialId,key:created.key,association});await persist();}
   if(!manifest.agents.some(a=>a.pool===pool!.id))throw new Error('Existing cedant pool has no saved keys; refusing to rotate or reconstruct credentials');
   for(const [i,a] of manifest.agents.filter(a=>a.poolIndex===poolIndex).entries()){if(a.pool!==pool.id||(associationFor(poolIndex,i)!==undefined&&JSON.stringify(a.association)!==JSON.stringify(associationFor(poolIndex,i))))throw new Error('Saved credential association differs; explicit credential lifecycle action required');}
   while(manifest.agents.filter(a=>a.pool===pool!.id).length<5){const n=manifest.agents.filter(a=>a.pool===pool!.id).length+1;const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'issue',poolId:pool.id,label:`Demo agent ${n}`,certificateAssociation:associationFor(poolIndex,n-1)},randomUUID())));if(!created.keyShown||!created.credentialId)throw new Error('Credential issue did not return a key');manifest.agents.push({poolIndex,pool:pool.id,credentialId:created.credentialId,key:created.key,association:associationFor(poolIndex,n-1)});await persist();}
   await withTenant(ctx,tx=>tx.query("UPDATE pool SET budgets=budgets||'{\"threads\":1}'::jsonb WHERE id=$1 AND NOT budgets ? 'threads'",[pool.id]));
   for(const s of sources)unwrap(await bindings.set(ctx,pool.id,s.id,true));
   const objects=await withTenant(ctx,tx=>tx.query<{id:string;name:string;schema:string;source:string}>(`SELECT o.id,o.exposed_name AS name,o.exposed_schema AS schema,s.exposed_alias AS source FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.source_id=ANY($1::uuid[]) AND o.status='active'`,[sources.map(s=>s.id)]));
   if(objects.length!==demoTables.length||new Set(objects.map(o=>o.name)).size!==demoTables.length)throw new Error('Expected all six declared objects after demo introspection');
   for(const object of objects){
    if(!demoTables.some(t=>t.name===object.name))throw new Error('Unexpected object in demo sources');
    manifest.objects[`${object.source}.${object.schema}.${object.name}`]=object.name;
    const columns=await withTenant(ctx,tx=>tx.query<{id:string;name:string;treatment:string|null;contributorKey:boolean}>(`SELECT e.id,e.exposed_name AS name,e.contributor_key AS "contributorKey",t.treatment FROM catalog_element e LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$2 WHERE e.object_id=$1 AND e.status='active'`,[object.id,pool.id]));
    // Claim aggregates protect the policy entity; repeated claims for one
    // policy must not count as independent contributors.
    const contributor=declaredContributorKey(object.name);
    if(contributor){
     if(columns.some(c=>c.contributorKey&&c.name!==contributor))throw new Error('Existing contributor declaration differs: '+object.name+'; it was not overwritten');
     await withTenant(ctx,tx=>tx.query('UPDATE catalog_element SET contributor_key=true WHERE id=$1 AND NOT contributor_key',[columns.find(c=>c.name===contributor)!.id]));
    }
    for(const column of columns){
     const treatment=declaredTreatment(object.name,column.name,poolIndex);
     if(treatment==='undecided'){if(column.treatment)throw new Error('Declared undecided column already has a decision: '+object.name+'.'+column.name+'; no entitlement was deleted');continue;}
     if(column.treatment){if(column.treatment!==treatment)throw new Error('Existing demo decision differs: '+column.name+'; it was not overwritten');continue;}
     if(treatment==='tokenized')await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET token_domain='policy',case_insensitive=false WHERE id=$1",[column.id]));
     const result=unwrap(await bulk.execute(ctx,pool.id,{projectId:ctx.projectId,elementIds:[ElementId(column.id)],treatment,maskKind:treatment==='masked'?'last4':null,justification:'Development reinsurance demo: shared V-01 definition and custody.'},randomUUID(),'dev-demo-soak'));if(result.status!==200)throw new Error('Demo treatment refused: '+result.body.error.message);
    }
    const existing=await withTenant(ctx,tx=>tx.query('SELECT id FROM row_entitlement WHERE object_id=$1 AND pool_id=$2',[object.id,pool.id]));
    const expression=declaredFilter(object.name,poolIndex);
    if(!existing.length&&expression)unwrap(await rows.save(ctx,pool.id,ObjectId(object.id),expression));
    const decision=unwrap(await rows.read(ctx,pool.id,ObjectId(object.id)));
    const expectedExpression=expression?'('+expression+')':null;
    if(decision.effectiveExpression!==expectedExpression)throw new Error('Existing row decision differs from declaration: '+object.name);
   }
  }
  // Dedicated lifecycle credentials: the ten ordinary callers keep their keys.
  manifest.lifecycle??={};
  for(const kind of ['retiring','revoked'] as const){
   const a=manifest.agents.find(a=>a.poolIndex===0)!;let probe=manifest.lifecycle[kind];
   if(!probe){const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'issue',poolId:PoolId(a.pool),label:'Soak '+kind,certificateAssociation:kind==='retiring'?a.association:undefined},randomUUID())));if(!issued.keyShown||!issued.credentialId)throw new Error('Lifecycle credential did not return a key');probe={...a,key:issued.key,credentialId:issued.credentialId,keyVersion:issued.keyVersion};manifest.lifecycle[kind]=probe;await persist();}
   if(!probe.done){
    if(kind==='retiring'){const rotated=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'rotate',poolId:PoolId(probe.pool),credentialId:CredentialId(probe.credentialId)},'soak-rotate-'+probe.keyVersion)));if(!rotated.keyShown)throw new Error('Interrupted rotation lost replacement key; operator recovery required');probe.replacementKey=rotated.key;const meta=unwrap(await keys.affected(ctx,PoolId(probe.pool),probe.keyVersion as import('../src/modules/pools/index.js').PoolKeyId));probe.graceUntil=meta.graceUntil;}
    else unwrap(await keys.execute(ctx,{kind:'revokeCredential',poolId:PoolId(probe.pool),credentialId:CredentialId(probe.credentialId),confirmation:'Soak revoked'},'soak-revoke-'+probe.credentialId));
    probe.done=true;await persist();
   }
  }
  manifest.version=2;manifest.definitionHash=hash;manifest.specification=generateSpecification(Object.fromEntries(Object.entries(manifest.objects).map(([full,name])=>[name,full])),manifest.agents);
  await persist();console.info('Demo soak ready: three sources, six objects, two pools, ten agents and two lifecycle probes. Declared scenarios: '+manifest.specification.scenarios.length+'. Private manifest: '+file+'. No keys printed.');
 }finally{await runtime.close();}
}

import {OperatorConflict} from './common.js';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile} from 'node:fs/promises';
import {dirname} from 'node:path';
import {setTimeout as pause} from 'node:timers/promises';
import {privateWrite,privateRead} from './common.js';
import {PostgresElementDeclarations} from '../../src/modules/catalog/index.js';
import {RegistryCustodyClient} from '../../src/modules/engines/index.js';
import {EnvironmentSecretStore,SecretRef} from '../../src/platform/secrets/index.js';
import {syntheticSource} from './infrastructure/synthetic-source.js';


import {withTenant} from '../../src/platform/db/scope.js';

import {PoolId,ElementId,ObjectId,type ProjectId,type UserId,type EngineId,type SourceId} from '../../src/shared/kernel/index.js';
import {CredentialId,PoolKeyService,PostgresPoolKeys,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings} from '../../src/modules/pools/index.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/index.js';
import {BulkEntitlementService,PostgresBulkEntitlements} from '../../src/modules/entitlements/index.js';
import type {SpiceDbAuthorizationPort} from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import type {EngineRegistry} from '../../src/modules/engines/index.js';
import {custodyAvailability} from '../../src/modules/release-custody/index.js';
import {createSourceRuntime} from '../../src/modules/sources/infrastructure/source-runtime.js';
import {PoolKeyCreationResponse} from '../../src/shared/api/pool-keys.js';
import {demoManifest,certificateMapping,certificateForAgent,type DemoManifest} from '../soak/manifest.js';
import {demoTables,declaredContributorKey,declaredTreatment,declaredFilter,generateSpecification} from '../demo-soak-definition.js';
import {PostgresRowDecisions} from '../../src/modules/entitlements/infrastructure/row-decisions.js';
import type {Result} from '../../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
export async function provisionReinsurance(ctx:{projectId:ProjectId;userId:UserId},registry:EngineRegistry,engineId:EngineId,auth:SpiceDbAuthorizationPort,associationFile:string|undefined,file:string,credentialRef:string,lifecycle=false,renew=false){
 if(!associationFile)throw new OperatorConflict('Set OPINTEL_CERTIFICATES to the four-device public mapping (no certificate keys)');
 certificateMapping.parse(JSON.parse(await readFile(associationFile,'utf8')));
 const {custodyAgents}=await import('../soak/custody.js');
 const device=custodyAgents(associationFile,process.env.OPINTEL_XQ_API_KEY??'',()=>{},state=>{console.log('Certificate',state.certificateId,state.ok?'exchanged':'unavailable',state.reason??'',state.status??'');});
 const associations=await device.associations().finally(()=>device.close());
 if(associations.length!==4)throw new OperatorConflict('Certificate exchange incomplete; all declared devices must be authorized before provisioning');
 const availability=await custodyAvailability(ctx.projectId);
 if(!availability.available||availability.configuration?.provider!=='xq')throw new OperatorConflict('Run demo-tools xq-check for the declared XQ provider before governance');
 const associationFor=(pool:number,index:number)=>{const slot=certificateForAgent(pool,index);return associations.find(v=>v.certificateId===slot.certificateId);};
 const hash=createHash('sha256').update(JSON.stringify(demoTables)).digest('hex');
 let manifest:DemoManifest={version:1,projectId:ctx.projectId,definitionHash:hash,agents:[],objects:{}};
 try{manifest=demoManifest.parse(JSON.parse(await privateRead(file)));if(manifest.projectId!==ctx.projectId||manifest.definitionHash!==hash)throw new OperatorConflict('Existing soak manifest is for another project or fixture version');}catch(error){if(!(error instanceof Error&&'code' in error&&error.code==='ENOENT'))throw error;}
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 const persist=async()=>privateWrite(file,manifest);
 const sourceTarget=new URL(await new EnvironmentSecretStore().resolve(SecretRef(credentialRef))),demoTarget=new URL(process.env.OPINTEL_DEMO_DATABASE_URL??'');
 if(sourceTarget.hostname!==demoTarget.hostname||(sourceTarget.port||'5432')!==(demoTarget.port||'5432')||sourceTarget.pathname!==demoTarget.pathname)throw new OperatorConflict('Configured source and explicit demo target differ');
 await syntheticSource(false);
 const runtime=createSourceRuntime(registry),outbox=new RelationshipOutbox();
 const declarations=new PostgresElementDeclarations(new RegistryCustodyClient(registry));
 const keys=new PoolKeyService(new PostgresPoolKeys(),new PostgresAgentPresence({publish:async()=>{}}));
 const bulk=new BulkEntitlementService(new PostgresBulkEntitlements(true)),bindings=new PoolBindingService(new PostgresPoolBindings(outbox),outbox,auth),rows=new PostgresRowDecisions(true);
 try{
  const sources:Array<{id:SourceId;exposed_alias:string;status:string}>=[];
  for(const [schema,name] of [['soak_policies','Reinsurance Policies'],['soak_claims','Reinsurance Claims'],['soak_recoveries','Reinsurance Recoveries']] as const){
   let [item]=await withTenant(ctx,tx=>tx.query<{id:import('../../src/shared/kernel/index.js').SourceId;exposed_alias:string;status:string;credential_ref:string;engine_id:string;include_schemas:string[];kind:string;sampling_consent:boolean;receives_landings:boolean}>("SELECT id,exposed_alias,status,credential_ref,engine_id,kind,sampling_consent,receives_landings,(SELECT include_schemas FROM introspection_run WHERE source_id=data_source.id ORDER BY created_at DESC,id DESC LIMIT 1) AS include_schemas FROM data_source WHERE name=$1",[name]));
   if(!item){const created=unwrap(await runtime.create(ctx,{name,kind:'postgres',credentialRef:credentialRef,engineId,includeSchemas:[schema],samplingConsent:false,receivesLandings:false,landingStrategy:null}));unwrap(await runtime.idle());item={id:created.id,exposed_alias:created.exposedAlias,status:created.status,credential_ref:credentialRef,engine_id:engineId,include_schemas:[schema],kind:'postgres',sampling_consent:false,receives_landings:false};}
   if(item.status==='archived'||item.kind!=='postgres'||item.sampling_consent||item.receives_landings||item.credential_ref!==credentialRef||item.engine_id!==engineId||JSON.stringify(item.include_schemas)!==JSON.stringify([schema]))throw new OperatorConflict(name+' is not the declared reinsurance source; refusing to modify it');
   const deadline=Date.now()+120000;
   for(;;){const [state]=await withTenant(ctx,tx=>tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1',[item!.id]));if(state?.status==='connected')break;if(!state||state.status==='unreachable'||Date.now()>deadline)throw new OperatorConflict('Remote source is not ready; inspect introspection and egress acknowledgment');await pause(1000);}
   const [connected]=await withTenant(ctx,tx=>tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1',[item!.id]));
   if(connected?.status!=='connected')throw new OperatorConflict(name+' is not connected; inspect the source in the console');
   item.status=connected.status;
   sources.push(item);
  }
  for(const poolIndex of [0,1]){
   const name=poolIndex===0?'Cedant 01':'Cedant 02',association=associationFor(poolIndex,0);
   let [pool]=await withTenant(ctx,tx=>tx.query<{id:PoolId}>('SELECT id FROM pool WHERE name=$1',[name]));
   if(!pool){const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'create',name,certificateAssociation:association},randomUUID())));if(!created.keyShown||!created.credentialId)throw new OperatorConflict('Pool creation did not return its credential');pool={id:PoolId(created.poolId)};manifest.agents.push({poolIndex,pool:pool.id,credentialId:created.credentialId,key:created.key,association});await persist();}
   if(!manifest.agents.some(a=>a.pool===pool!.id))throw new OperatorConflict('Existing cedant pool has no saved keys; refusing to rotate or reconstruct credentials');
   for(const [i,a] of manifest.agents.filter(a=>a.poolIndex===poolIndex).entries()){if(a.pool!==pool.id||(associationFor(poolIndex,i)!==undefined&&JSON.stringify(a.association)!==JSON.stringify(associationFor(poolIndex,i))))throw new OperatorConflict('Saved credential association differs; explicit credential lifecycle action required');}
   const credentials=await withTenant(ctx,tx=>tx.query<{id:string;revoked_at:string|null}>('SELECT id,revoked_at FROM pool_credential WHERE pool_id=$1',[pool.id]));
   const known=[...manifest.agents,...Object.values(manifest.lifecycle??{})].filter(a=>a.pool===pool!.id);
   if(credentials.some(c=>!known.some(a=>a.credentialId===c.id))||manifest.agents.filter(a=>a.pool===pool!.id).some(a=>!credentials.some(c=>c.id===a.credentialId&&!c.revoked_at)))throw new OperatorConflict('Credential inventory conflict or interrupted issuance; refusing to issue replacement credentials');
   for(const a of manifest.agents.filter(a=>a.pool===pool!.id)){const current=await withTenant(ctx,tx=>tx.query("SELECT 1 FROM pool_key k JOIN pool_credential c ON c.id=k.credential_id WHERE c.id=$1 AND k.key_hash=$2 AND k.state='current' AND c.association_status='associated' AND c.certificate_id=$3 AND c.device_name=$4 AND c.recipient_identifier=$5",[a.credentialId,createHash('sha256').update(a.key).digest(),a.association?.certificateId,a.association?.deviceName,a.association?.recipientIdentifier]));if(current.length!==1)throw new OperatorConflict('Saved caller key or public association changed; no credential was rotated');}
   while(manifest.agents.filter(a=>a.pool===pool!.id).length<5){const n=manifest.agents.filter(a=>a.pool===pool!.id).length+1;const created=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'issue',poolId:pool.id,label:`Demo agent ${n}`,certificateAssociation:associationFor(poolIndex,n-1)},randomUUID())));if(!created.keyShown||!created.credentialId)throw new OperatorConflict('Credential issue did not return a key');manifest.agents.push({poolIndex,pool:pool.id,credentialId:created.credentialId,key:created.key,association:associationFor(poolIndex,n-1)});await persist();}
   await withTenant(ctx,async tx=>{const [current]=await tx.query<{budgets:Record<string,unknown>}>('SELECT budgets FROM pool WHERE id=$1 FOR UPDATE',[pool.id]);if(!current||Object.keys(current.budgets).some(k=>k!=='threads')||current.budgets.threads!==undefined&&current.budgets.threads!==1)throw new OperatorConflict('Pool resource decision conflicts with V-01 threads=1');if(current.budgets.threads===undefined)await tx.query("UPDATE pool SET budgets=budgets||'{\"threads\":1}'::jsonb WHERE id=$1",[pool.id]);});
   for(const s of sources){const found=await withTenant(ctx,tx=>tx.query('SELECT 1 FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2',[pool.id,s.id]));if(!found.length)unwrap(await bindings.set(ctx,pool.id,s.id,true));}
   const objects=await withTenant(ctx,tx=>tx.query<{id:string;name:string;schema:string;source:string;originalSchema:string;originalName:string}>(`SELECT o.id,o.exposed_name AS name,o.exposed_schema AS schema,s.exposed_alias AS source,o.schema_name AS "originalSchema",o.object_name AS "originalName" FROM catalog_object o JOIN data_source s ON s.id=o.source_id WHERE o.source_id=ANY($1::uuid[]) AND o.status='active' ORDER BY o.id`,[sources.map(s=>s.id)]));
   if(objects.length!==demoTables.length||new Set(objects.map(o=>o.name)).size!==demoTables.length)throw new OperatorConflict('Expected all six declared objects after demo introspection');
   for(const object of objects){
    const expectedTable=demoTables.find(t=>t.name===object.name);
    if(!expectedTable||object.originalName!==expectedTable.name||object.originalSchema!==expectedTable.schema)throw new OperatorConflict('Unexpected object in demo sources');
    manifest.objects[`${object.source}.${object.schema}.${object.name}`]=object.name;
    const columns=await withTenant(ctx,tx=>tx.query<{id:string;name:string;type:string|null;treatment:string|null;maskKind:string|null;contributorKey:boolean}>(`SELECT e.id,e.exposed_name AS name,e.exposed_type AS type,e.contributor_key AS "contributorKey",t.treatment,t.mask_kind AS "maskKind" FROM catalog_element e LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$2 WHERE e.object_id=$1 AND e.status='active' ORDER BY e.ordinal,e.id`,[object.id,pool.id]));
    const expectedColumns=Object.keys(expectedTable.rows[0]!);if(columns.length!==expectedColumns.length||columns.some(c=>!expectedColumns.includes(c.name)||c.type!==(c.name==='claim_amount'?'INTEGER':c.name==='loss_date'?'DATE':'VARCHAR')))throw new OperatorConflict('Catalogue differs from the versioned synthetic declaration');
    // Claim aggregates protect the policy entity; repeated claims for one
    // policy must not count as independent contributors.
    const contributor=declaredContributorKey(object.name);
    if(contributor){
     if(columns.some(c=>c.contributorKey&&c.name!==contributor))throw new OperatorConflict('Existing contributor declaration differs: '+object.name+'; it was not overwritten');
     const key=columns.find(c=>c.name===contributor);if(!key)throw new OperatorConflict('Declared contributor is absent');if(!key.contributorKey){const d=unwrap(await declarations.read(ctx,ElementId(key.id)));unwrap(await declarations.save(ctx,ElementId(key.id),{...d.stored,contributorKey:true},d.stored));}
    }
    for(const column of columns){
     const treatment=declaredTreatment(object.name,column.name,poolIndex);
     if(treatment==='undecided'){if(column.treatment)throw new OperatorConflict('Declared undecided column already has a decision: '+object.name+'.'+column.name+'; no entitlement was deleted');continue;}
     if(column.treatment&&(column.treatment!==treatment||column.maskKind!==(treatment==='masked'?'last4':null)))throw new OperatorConflict('Existing demo decision differs: '+column.name+'; it was not overwritten');
     if(treatment==='tokenized'){const d=unwrap(await declarations.read(ctx,ElementId(column.id)));if(d.stored.tokenDomain!==null&&d.stored.tokenDomain!=='policy'||d.stored.caseInsensitive===true)throw new OperatorConflict('Token declaration conflict');if(d.stored.tokenDomain!=='policy'||d.stored.caseInsensitive!==false)unwrap(await declarations.save(ctx,ElementId(column.id),{...d.stored,tokenDomain:'policy',caseInsensitive:false},d.stored));}
     if(column.treatment)continue;

     const result=unwrap(await bulk.execute(ctx,pool.id,{projectId:ctx.projectId,elementIds:[ElementId(column.id)],treatment,maskKind:treatment==='masked'?'last4':null,justification:'Synthetic reinsurance: versioned V-01 governance and custody.'},randomUUID(),'packaged-reinsurance'));if(result.status!==200)throw new OperatorConflict('Demo treatment refused: '+result.body.error.message);
    }
    const existing=await withTenant(ctx,tx=>tx.query('SELECT id FROM row_entitlement WHERE object_id=$1 AND pool_id=$2',[object.id,pool.id]));
    const expression=declaredFilter(object.name,poolIndex);
    if(!existing.length&&expression)unwrap(await rows.save(ctx,pool.id,ObjectId(object.id),expression));
    const decision=unwrap(await rows.read(ctx,pool.id,ObjectId(object.id)));
    const expectedExpression=expression?'('+expression+')':null;
    if(decision.effectiveExpression!==expectedExpression)throw new OperatorConflict('Existing row decision differs from declaration: '+object.name);
   }
  }
  // Dedicated lifecycle credentials: the ten ordinary callers keep their keys.
  if(lifecycle){
  manifest.lifecycle??={};
  if(renew){for(const kind of ['retiring','revoked']){const old=manifest.lifecycle[kind];if(old){manifest.lifecycle[kind+'-previous-'+old.credentialId]=old;delete manifest.lifecycle[kind];}}await persist();}
  for(const kind of ['retiring','revoked'] as const){
   const a=manifest.agents.find(a=>a.poolIndex===0)!;let probe=manifest.lifecycle[kind];
   if(!probe){const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'issue',poolId:PoolId(a.pool),label:'Soak '+kind,certificateAssociation:kind==='retiring'?a.association:undefined},randomUUID())));if(!issued.keyShown||!issued.credentialId)throw new OperatorConflict('Lifecycle credential did not return a key');probe={...a,key:issued.key,credentialId:issued.credentialId,keyVersion:issued.keyVersion};manifest.lifecycle[kind]=probe;await persist();}
   if(!probe.done){
    if(kind==='retiring'){const rotated=PoolKeyCreationResponse.parse(unwrap(await keys.execute(ctx,{kind:'rotate',poolId:PoolId(probe.pool),credentialId:CredentialId(probe.credentialId)},'soak-rotate-'+probe.keyVersion)));if(!rotated.keyShown)throw new OperatorConflict('Interrupted rotation lost replacement key; operator recovery required');probe.replacementKey=rotated.key;const meta=unwrap(await keys.affected(ctx,PoolId(probe.pool),probe.keyVersion as import('../../src/modules/pools/index.js').PoolKeyId));probe.graceUntil=meta.graceUntil;}
    else unwrap(await keys.execute(ctx,{kind:'revokeCredential',poolId:PoolId(probe.pool),credentialId:CredentialId(probe.credentialId),confirmation:'Soak revoked'},'soak-revoke-'+probe.credentialId));
    probe.done=true;await persist();
   }
  }
  }
  manifest.version=2;manifest.definitionHash=hash;manifest.specification=generateSpecification(Object.fromEntries(Object.entries(manifest.objects).map(([full,name])=>[name,full])),manifest.agents);
  await persist();console.info('Reinsurance governance ready: three sources, six objects, two pools and ten agents. Lifecycle probes ready: '+['retiring','revoked'].filter(kind=>manifest.lifecycle?.[kind]?.done).length+'/2. Declared scenarios: '+manifest.specification.scenarios.length+'. Private manifest: '+file+'. No keys printed.');
 }finally{await runtime.close();}
}

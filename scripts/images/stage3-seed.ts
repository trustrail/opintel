/** Test-only fixture, mounted into a disposable acceptance container, never shipped. */
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {withPlatform,withTenant} from '../../src/platform/db/scope.js';
import {ProjectId,UserId,PoolId,SourceId,ElementId,SystemClock,type Result} from '../../src/shared/kernel/index.js';
import {PoolKeyService,PostgresPoolKeys,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings} from '../../src/modules/pools/index.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/index.js';
import {SpiceDbAuthorizationPort} from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import {PoolKeyCreationResponse} from '../../src/shared/api/pool-keys.js';
function unwrap<T>(value:Result<T>):T{if(!value.ok)throw value.error;return value.value;}
if(process.env.OPINTEL_STAGE3_SMOKE!=='synthetic-only'||!process.env.SMOKE_PROJECT_ID||!process.env.SMOKE_USER_ID)throw new Error('Disposable stage-3 acceptance context required.');
const ctx={projectId:ProjectId(process.env.SMOKE_PROJECT_ID),userId:UserId(process.env.SMOKE_USER_ID)},source=SourceId(process.env.SMOKE_SOURCE_ID??randomUUID()),element=ElementId(randomUUID());
const owner=await withPlatform(tx=>tx.query<{email:string}>(`SELECT u.email FROM installation_owner_claim c JOIN user_account u ON u.id=c.redeemed_by JOIN project p ON p.company_id=c.company_id WHERE c.redeemed_by=$1 AND p.id=$2 AND c.redeemed_at IS NOT NULL`,[ctx.userId,ctx.projectId]));
if(owner.length!==1||owner[0]?.email!=='stage3-owner@example.invalid')throw new Error('Acceptance owner must have redeemed the real installation claim.');
const auth=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:0});
try{
 const presence=new PostgresAgentPresence({publish:async()=>{}});
 const issued=PoolKeyCreationResponse.parse(unwrap(await new PoolKeyService(new PostgresPoolKeys(),presence).execute(ctx,{kind:'create',name:'Acceptance pool'},randomUUID())));
 if(!issued.keyShown)throw new Error('Missing acceptance pool credential');const pool=PoolId(issued.poolId);
 await withTenant(ctx,async tx=>{
  await tx.query('UPDATE pool SET budgets=$2 WHERE id=$1',[pool,{threads:1}]);
  await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Synthetic acceptance source','image_source','postgres','secret://acceptance/source','connected')",[source,ctx.projectId]);
  if(process.env.SMOKE_INGEST==='1')await tx.query("UPDATE data_source SET receives_landings=true,landing_strategy='append_as_at' WHERE id=$1",[source]);
  const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'image_smoke','records','table','public','records') RETURNING id",[ctx.projectId,source]);if(!object)throw new Error('Object fixture missing');
  await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal,stable_ref) VALUES($1,$2,$3,'answer','int4','answer','INTEGER',1,'1')",[element,ctx.projectId,object.id]);
  await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[pool,element,ctx.projectId,ctx.userId]);
 });
 const outbox=new RelationshipOutbox();unwrap(await new PoolBindingService(new PostgresPoolBindings(outbox),outbox,auth).set(ctx,pool,source,true));
 await writeFile('/mail/stage3-fixture.json',JSON.stringify({projectId:ctx.projectId,sourceId:source,key:issued.key,agentId:'stage3-smoke'})+'\n',{mode:0o600});
}finally{auth.close();}
process.exit(0);

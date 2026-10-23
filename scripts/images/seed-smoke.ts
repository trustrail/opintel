/** Disposable image-smoke fixture. Requires the isolated Compose database. */
import {randomUUID,X509Certificate} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {withPlatform,withTenant} from '../../src/platform/db/scope.js';
import {ProjectId,UserId,PoolId,SourceId,ElementId,SystemClock,type Result} from '../../src/shared/kernel/index.js';
import {PoolKeyService,PostgresPoolKeys,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings} from '../../src/modules/pools/index.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/index.js';
import {SpiceDbAuthorizationPort} from '../../src/modules/authz/infrastructure/spicedb-authorization-port.js';
import {EngineRegistry,PostgresEngineRepository,HttpsEngineProbe,loadApplicationTls} from '../../src/modules/engines/index.js';
import {EngineRegistration} from '../../src/shared/api/engines.js';
import {PoolKeyCreationResponse} from '../../src/shared/api/pool-keys.js';
function unwrap<T>(r:Result<T>):T{if(!r.ok)throw r.error;return r.value;}
if(process.env.OPINTEL_IMAGE_SMOKE!=='synthetic-only'||new URL(process.env.DATABASE_URL!).pathname!=='/opintel_image_smoke')throw new Error('Isolated image-smoke environment required.');
const ctx={projectId:ProjectId(randomUUID()),userId:UserId(randomUUID())},source=SourceId(randomUUID()),element=ElementId(randomUUID());
const auth=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:0});
try{
 await auth.loadSchema(await readFile('docs/opintel-schema.zed','utf8'));
 await withPlatform(async tx=>{
  await tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[ctx.userId,`${ctx.userId}@image-smoke.invalid`]);
  const [industry]=await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');if(!industry)throw new Error('Migration industry seed missing');
  const [company]=await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Image smoke','eu-west-1') RETURNING id");if(!company)throw new Error('Company fixture missing');
  await tx.query("INSERT INTO project(id,company_id,industry_id,name,region,settings) VALUES($1,$2,$3,'Image smoke','eu-west-1',$4)",[ctx.projectId,company.id,industry.id,{agentHeartbeatSeconds:30,agentDisconnectGraceSeconds:60,query:{rowLimit:100,timeoutSeconds:30,memoryLimitMb:128,concurrencyPerPool:1,aggregateMinGroupSize:5}}]);
  await tx.query("INSERT INTO project_member(project_id,user_id,role) VALUES($1,$2,'admin')",[ctx.projectId,ctx.userId]);
 });
 await auth.write([{operation:'touch',resource:{type:'project',id:ctx.projectId},relation:'admin',subject:{type:'user',id:ctx.userId}}]);
 const presence=new PostgresAgentPresence({publish:async()=>{}});
 const issued=PoolKeyCreationResponse.parse(unwrap(await new PoolKeyService(new PostgresPoolKeys(),presence).execute(ctx,{kind:'create',name:'Image pool'},randomUUID())));
 if(!issued.keyShown)throw new Error('Missing smoke credential');const pool=PoolId(issued.poolId);
 await withTenant(ctx,async tx=>{
  await tx.query('UPDATE pool SET budgets=$2 WHERE id=$1',[pool,{threads:1}]);
  await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Synthetic source','image_source','postgres','secret://image/source','connected')",[source,ctx.projectId]);
  const [object]=await tx.query<{id:string}>("INSERT INTO catalog_object(project_id,source_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,'image_smoke','records','table','public','records') RETURNING id",[ctx.projectId,source]);if(!object)throw new Error('Object fixture missing');
  await tx.query("INSERT INTO catalog_element(id,project_id,object_id,source_identifier,source_type,exposed_name,exposed_type,ordinal) VALUES($1,$2,$3,'answer','int4','answer','INTEGER',1)",[element,ctx.projectId,object.id]);
  await tx.query("INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref) VALUES($1,$2,$3,'clear','user',$4)",[pool,element,ctx.projectId,ctx.userId]);
 });
 const outbox=new RelationshipOutbox();unwrap(await new PoolBindingService(new PostgresPoolBindings(outbox),outbox,auth).set(ctx,pool,source,true));
 const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(),await loadApplicationTls('/config/application-tls.json'));
 const certificatePin=new X509Certificate(await readFile('/config/tls/server.pem','utf8')).fingerprint256;
 const engine=unwrap(await registry.register(ctx,EngineRegistration.parse({name:'Image engine',address:'https://egress:3100',certificatePin})));
 unwrap(await registry.verify(ctx,engine.id));unwrap(await registry.assign(ctx,source,engine.id));
 await writeFile('/mail/image-smoke.json',JSON.stringify({projectId:ctx.projectId,key:issued.key}),{mode:0o600});
 console.info('Image smoke fixture ready; credential retained only in runtime mail volume.');
}finally{auth.close();}
process.exit(0);

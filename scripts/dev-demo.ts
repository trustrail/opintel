import {mkdir,open,unlink,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {loadDevEnvironment} from './dev-environment.js';
import {assertDevelopmentDemo,demoTreatment,retainDemoLandingZone} from './dev-demo-policy.js';
import {CompanyId,ProjectId,UserId,PoolId,SourceId,SystemClock,DomainError,type Result,type IndustryId,type ElementId} from '../src/shared/kernel/index.js';
const userId=UserId('de000000-0000-4000-8000-000000000001');
const companyId=CompanyId('de000000-0000-4000-8000-000000000002');
const projectId=ProjectId('de000000-0000-4000-8000-000000000003');
const ctx={userId,projectId};
const unwrap=<T>(result:Result<T>):T=>{if(!result.ok)throw result.error;return result.value;};
async function main(){
 loadDevEnvironment();assertDevelopmentDemo(process.env);
 await mkdir('tmp',{recursive:true});const lock=await open('tmp/dev-demo.lock','wx',0o600).catch(()=>{throw new Error('dev:demo is locked. Check for another run before removing tmp/dev-demo.lock.');});
 try{await provision();}finally{await lock.close();await unlink('tmp/dev-demo.lock');}
}
async function provision(){
 const {prepareDevelopmentServices}=await import('./dev-up.js');await prepareDevelopmentServices();
 // Database scopes are initialized only after the environment is loaded.
 const {withPlatform,withTenant}=await import('../src/platform/db/scope.js');
 const {RelationshipOutbox}=await import('../src/modules/tenancy/index.js');
 const {SpiceDbAuthorizationPort}=await import('../src/modules/authz/infrastructure/spicedb-authorization-port.js');
 const outbox=new RelationshipOutbox();
 const auth=new SpiceDbAuthorizationPort({endpoint:process.env.SPICEDB_ENDPOINT!,token:process.env.SPICEDB_TOKEN!,clock:new SystemClock(),stalenessCeilingMs:10000});
 try{
 const [industry]=await withPlatform(tx=>tx.query<{id:IndustryId}>("SELECT id FROM industry WHERE slug='reinsurance-treaty'"));if(!industry)throw new Error('Reinsurance pack is missing after migrations.');
 await withPlatform(tx=>tx.query("INSERT INTO user_account(id,email,full_name) VALUES($1,'demo@opintel.local','Development Demo') ON CONFLICT(id) DO NOTHING",[userId]));
 await withPlatform(async tx=>{
  await tx.query("INSERT INTO company(id,name,default_industry_id,default_region) VALUES($1,'Development Demo',$2,'eu-west-1') ON CONFLICT(id) DO NOTHING",[companyId,industry.id]);
  await tx.query("INSERT INTO company_member(company_id,user_id,role,granted_by) VALUES($1,$2,'admin',$2) ON CONFLICT DO NOTHING",[companyId,userId]);
 });
 await withPlatform(async tx=>{
  await tx.query("INSERT INTO project(id,company_id,industry_id,name,region,settings) VALUES($1,$2,$3,'Reinsurance Demo','eu-west-1',$4) ON CONFLICT(id) DO NOTHING",[projectId,companyId,industry.id,{poolKeyGraceSeconds:3600,query:{rowLimit:1000,timeoutSeconds:30,memoryLimitMb:256,concurrencyPerPool:2,aggregateMinGroupSize:5}}]);
  await tx.query("INSERT INTO project_member(project_id,user_id,role,granted_by) VALUES($1,$2,'admin',$2) ON CONFLICT DO NOTHING",[projectId,userId]);
 });
 // Touch restores authorization after a SpiceDB volume wipe as well.
 await auth.write([{operation:'touch',resource:{type:'company',id:companyId},relation:'admin',subject:{type:'user',id:userId}},{operation:'touch',resource:{type:'project',id:projectId},relation:'company',subject:{type:'company',id:companyId}},{operation:'touch',resource:{type:'project',id:projectId},relation:'admin',subject:{type:'user',id:userId}}]);
 const {prepareSidecarDevelopment,startDevelopmentSidecar,sidecarDevDirectory}=await import('./sidecar-dev.js');
 await prepareSidecarDevelopment();
 const serviceFile=join(sidecarDevDirectory,'service.json');
 const {loadSidecarConfig}=await import('../sidecar/config.js');
 const {config}=await loadSidecarConfig(serviceFile);
 const [reserved]=await withPlatform(tx=>tx.query<{source:SourceId|null}>("SELECT deployment_ref->($1::text)->>'sourceId' AS source FROM demo_source_template WHERE id='31100000-0000-4000-8000-000000000001'",[projectId]));
 // A volume wipe leaves local landing configuration behind. Retire references
 // to destroyed projects and this fixture's old reservation, keeping all files.
 const projects=await withPlatform(tx=>tx.query<{id:ProjectId}>('SELECT id FROM project WHERE id=ANY($1::uuid[])',[(config.landingZones??[]).map(z=>z.projectId)]));
 const projectIds=new Set(projects.map(p=>p.id));
 const zones=(config.landingZones??[]).filter(z=>retainDemoLandingZone(z,projectIds,projectId,reserved?.source??null));
 if(zones.length!==(config.landingZones??[]).length){
  const raw=await readFile(serviceFile,'utf8');const original=JSON.parse(raw) as Record<string,unknown>;
  const backup=serviceFile+`.before-demo-${Date.now()}`;await writeFile(backup,raw,{mode:0o600,flag:'wx'});
  await writeFile(serviceFile+'.next',JSON.stringify({...original,landingZones:zones},null,2)+'\n',{mode:0o600});await rename(serviceFile+'.next',serviceFile);
  console.info(`Retired ${config.landingZones!.length-zones.length} stale landing zone(s); previous configuration saved in ${backup}. Landing files and registers are retained.`);
 }
 const {demoPack}=await import('./demo-pack.js');await demoPack('prepare',projectId,userId,undefined,{showNextSteps:false});
 const [deployment]=await withPlatform(tx=>tx.query<{source:SourceId}>("SELECT deployment_ref->($1::text)->>'sourceId' AS source FROM demo_source_template WHERE id='31100000-0000-4000-8000-000000000001'",[projectId]));if(!deployment?.source)throw new Error('Demo preparation did not reserve a source.');
 const sourceId=SourceId(deployment.source);
 const {checkDevelopmentLandingZones}=await import('./sidecar-landing-check.js');await checkDevelopmentLandingZones((await loadSidecarConfig(serviceFile)).config.landingZones??[]);
 await startDevelopmentSidecar();
 // Use the real receipt application even when dev:api has not started yet.
 const {loadSidecarClientOptions}=await import('../src/modules/sources/index.js');
 const options=await loadSidecarClientOptions(join(sidecarDevDirectory,'client.json'));
 const {createLandingReceiptServer}=await import('../src/modules/ingest/api/landing-receipt-server.js');
 const {AcceptLandingReceipt}=await import('../src/modules/ingest/application/landing-receipts.js');
 const {PostgresLandingReceiptRepository}=await import('../src/modules/ingest/infrastructure/landing-receipts.js');
 const {PostgresFilingRegister}=await import('../src/modules/ingest/infrastructure/register.js');
 const receipts=createLandingReceiptServer(options.tls,new AcceptLandingReceipt(new PostgresLandingReceiptRepository()),new PostgresFilingRegister());
 const listening=await new Promise<boolean>((resolve,reject)=>{receipts.once('error',(error:Error & {code?:string})=>error.code==='EADDRINUSE'?resolve(false):reject(error));receipts.listen(3101,'127.0.0.1',()=>resolve(true));});
 try{
  const [source]=await withTenant(ctx,tx=>tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1',[sourceId]));
  if(source?.status!=='connected')await demoPack('provision',projectId,userId,sourceId);
 }finally{if(listening)await new Promise<void>((resolve,reject)=>receipts.close(e=>e?reject(e):resolve()));}
 // New landing tables have no planner statistics until ANALYZE/autovacuum.
 // Bootstrap them explicitly; the query path remains strictly read-only.
 const {PostgresLanding}=await import('../sidecar/ingest/infrastructure/postgres-landing.js');
 const {EnvironmentSecretStore}=await import('../src/platform/secrets/index.js');
 const zone=(await loadSidecarConfig(serviceFile)).config.landingZones?.find(z=>z.sourceId===sourceId);
 if(!zone?.landing)throw new Error('The demo landing zone disappeared during preparation.');
 unwrap(await new PostgresLanding(new EnvironmentSecretStore()).analyze({projectId,sourceId,...zone.landing}));
 const {PoolKeyService,PostgresPoolKeys,PostgresAgentPresence,PoolBindingService,PostgresPoolBindings}=await import('../src/modules/pools/index.js');
 let [pool]=await withTenant(ctx,tx=>tx.query<{id:PoolId}>("SELECT id FROM pool WHERE name='Development Demo'"));
 if(!pool){
  const result=unwrap(await new PoolKeyService(new PostgresPoolKeys(),new PostgresAgentPresence({publish:async()=>{}})).execute(ctx,{kind:'create',name:'Development Demo'},'dev-demo-pool-v1'));
  pool={id:PoolId(result.poolId)};
  // The ordinary service returns plaintext once; never save it or rotate on rerun.
  if(result.keyShown)process.stdout.write(`Pool key (shown once): ${result.key}\n`);
 }else console.info('Pool key already issued; it is not reprinted or rotated.');
 const poolId=PoolId(pool.id);
 await withTenant(ctx,tx=>tx.query("UPDATE pool SET budgets=budgets||'{\"threads\":1}'::jsonb WHERE id=$1 AND NOT budgets ? 'threads'",[poolId]));
 unwrap(await new PoolBindingService(new PostgresPoolBindings(outbox),outbox,auth).set(ctx,poolId,sourceId,true));
 const columns=await withTenant(ctx,tx=>tx.query<{id:ElementId;sourceIdentifier:string;exposedType:string|null;ordinal:number|null;decided:boolean}>(`SELECT e.id,e.source_identifier AS "sourceIdentifier",e.exposed_type AS "exposedType",e.ordinal,t.element_id IS NOT NULL AS decided FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id LEFT JOIN entitlement t ON t.element_id=e.id AND t.pool_id=$2 WHERE o.source_id=$1 AND o.status='active' AND e.status='active' ORDER BY o.exposed_schema,o.exposed_name,e.ordinal`,[sourceId,poolId]));
 const {BulkEntitlementService,PostgresBulkEntitlements,PostgresEntitlementReader}=await import('../src/modules/entitlements/index.js');
 const bulk=new BulkEntitlementService(new PostgresBulkEntitlements());
 for(const treatment of ['clear','tokenized','masked','aggregate_only','withheld'] as const){
  const textColumns=columns.filter(c=>c.exposedType==='VARCHAR'&&!c.sourceIdentifier.startsWith('_'));
  const selected=columns.filter(c=>!c.decided&&demoTreatment(c,textColumns.indexOf(c))===treatment);if(!selected.length)continue;
  if(treatment==='tokenized')await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET token_domain=COALESCE(token_domain,'treaty'),case_insensitive=COALESCE(case_insensitive,false) WHERE id=ANY($1::uuid[])",[selected.map(c=>c.id)]));
  const key='dev-demo-'+treatment+'-'+selected.map(c=>c.id).join(',');
  const result=unwrap(await bulk.execute(ctx,poolId,{projectId,elementIds:selected.map(c=>c.id),treatment,maskKind:treatment==='masked'?'all':null,justification:'Development demo: synthetic reinsurance data.'},key,'dev-demo'));
  if(result.status!==200)throw new Error(`${treatment}: ${result.body.error.message} ${JSON.stringify(result.body.error.details??{})}`);
 }
 const compiled=unwrap(await new PostgresEntitlementReader().compilation(ctx,poolId));
 const counts=await withTenant(ctx,tx=>tx.query<{treatment:string;n:number}>('SELECT treatment,count(*)::int AS n FROM entitlement WHERE pool_id=$1 GROUP BY treatment ORDER BY treatment',[poolId]));
 if(counts.length!==5)throw new Error('The demo did not produce all five treatment decisions. Existing decisions were preserved.');
 console.info(`Demo user: demo@opintel.local\nProject: ${projectId}\nPool: ${poolId}\nMCP endpoint: http://127.0.0.1:${process.env.PORT??process.env.API_PORT??'3000'}/mcp/v1/p/${projectId}`);
 console.info('Treatments: '+counts.map(r=>`${r.treatment}=${r.n}`).join(', '));
 const quote=(name:string)=>`"${name.replaceAll('"','""')}"`;
 const view=compiled.compilation.views[0];if(view){const fields=view.columns.filter(c=>c.state==='emitted'&&c.treatment!=='aggregate_only'&&c.exposedName!==null).map(c=>quote(c.exposedName!));console.info(`Example SQL: SELECT ${fields.join(', ')} FROM ${quote(view.catalog)}.${quote(view.schema)}.${quote(view.name)} LIMIT 5`);}
 console.info('Aggregate example: use COUNT or MIN on an inception-date column; raw reads of aggregate-only columns are refused.');
 console.info('Run npm run dev:api to serve MCP. Send Authorization: Bearer <pool key> and X-Opintel-Agent-Id: dev-demo.');
 }finally{auth.close();}
}
void main().catch((error:unknown)=>{console.error(`dev:demo failed: ${error instanceof DomainError?error.message:error instanceof Error?error.message:'Provisioning failed.'}`);process.exitCode=1;});

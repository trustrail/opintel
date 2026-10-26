import {matchingSettings} from './preconditions.js';
import {OperatorConflict} from './common.js';
import {createHash} from 'node:crypto';
import {withPlatform} from '../../src/platform/db/scope.js';
import {IndustryId,ProjectName,ProjectId,type Region} from '../../src/shared/kernel/index.js';
import {CreateProjectService} from '../../src/modules/tenancy/application/create-project.js';
import {PostgresProjectCreationRepository} from '../../src/modules/tenancy/infrastructure/project-creation-repository.js';
import {RelationshipOutbox} from '../../src/modules/tenancy/application/relationship-outbox.js';
import {PostgresSettings} from '../../src/modules/tenancy/infrastructure/settings.js';
import {EngineRegistry,PostgresEngineRepository,HttpsEngineProbe,loadApplicationTls,RegistryCustodyClient} from '../../src/modules/engines/index.js';
import {EngineRegistration} from '../../src/shared/api/engines.js';
import {KeyCustodyService,PostgresCustodyRepository} from '../../src/modules/entitlements/index.js';
import {ReleaseRuntime} from '../../src/modules/release-custody/index.js';
import {ProjectSettings} from '../../src/shared/project-settings.js';
import {context,required,unwrap,locked,privateWrite,privateRead,provisionManifest} from './common.js';
export async function provision(){const c=await context();try{
 const file=required('OPINTEL_PROVISION_MANIFEST');await locked(file,async()=>{
 const hash=createHash('sha256').update(JSON.stringify(c.config)).digest('hex');
 let saved;try{saved=provisionManifest.parse(JSON.parse(await privateRead(file)));if(saved.configHash!==hash)throw new OperatorConflict('Provisioning configuration conflict; existing decisions were preserved');}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
 const industry=await withPlatform(tx=>tx.query<{id:string}>("SELECT id FROM industry WHERE slug='reinsurance-treaty'"));if(industry.length!==1)throw new OperatorConflict('Reinsurance industry is missing');
 const projects=await withPlatform(tx=>tx.query<{id:string;industry_id:string;region:string}>('SELECT id,industry_id,region FROM project WHERE company_id=$1 AND name=$2',[c.companyId,c.config.projectName]));
 if(projects.length>1)throw new OperatorConflict('Ambiguous project name');
 let project=projects[0];
 if(!project){if(saved)throw new OperatorConflict('Recorded project is missing');const outbox=new RelationshipOutbox();const created=unwrap(await new CreateProjectService(new PostgresProjectCreationRepository(outbox),outbox,c.auth).create({companyId:c.companyId,name:ProjectName(c.config.projectName),industryId:IndustryId(industry[0]!.id),region:c.config.region as Region},c.userId));project={id:created.id,industry_id:created.industry.id,region:created.region};}
 if(project.industry_id!==industry[0]!.id||project.region!==c.config.region||(saved&&saved.projectId!==project.id))throw new OperatorConflict('Project configuration conflict');
 const ctx={projectId:ProjectId(project.id),userId:c.userId};await c.authorize('project',ctx.projectId);
 const settings=new PostgresSettings(),current=unwrap(await settings.project(ctx.projectId)).settings;
 const desired=ProjectSettings.parse(c.config.settings);
 // Fill only absent settings. Every pre-existing value is an immutable decision here.

 const merged=matchingSettings(current,desired);if(JSON.stringify(merged)!==JSON.stringify(current))unwrap(await new ReleaseRuntime().saveProjectSettings(ctx,merged,undefined,current));
 const registry=new EngineRegistry(new PostgresEngineRepository(),new HttpsEngineProbe(required('ENGINE_HEARTBEAT_URL')),await loadApplicationTls(required('APPLICATION_TLS_CONFIG')));
 const input=EngineRegistration.parse(c.config.engine),engines=await registry.list(ctx,null,1000);if(engines.length===1000)throw new OperatorConflict('Engine inventory exceeds operator limit');
 const matches=engines.filter(e=>e.name===input.name||e.address===input.address);if(matches.length>1)throw new OperatorConflict('Ambiguous engine configuration');let engine=matches[0];
 if(engine&&(engine.name!==input.name||engine.address!==input.address||engine.certificatePin!==input.certificatePin))throw new OperatorConflict('Engine configuration conflict');
 if(!engine)engine={...unwrap(await registry.register(ctx,input)),sources:[]};if(saved&&saved.engineId!==engine.id)throw new OperatorConflict('Recorded engine differs');
 if(!engine.verifiedAt)unwrap(await registry.verify(ctx,engine.id));
 if(engines.some(e=>e.custody&&e.id!==engine.id))throw new OperatorConflict('Custody engine conflict');if(!engine.custody)unwrap(await registry.designate(ctx,engine.id));
 if(!saved)unwrap(await new KeyCustodyService(new PostgresCustodyRepository(),new RegistryCustodyClient(registry),c.auth).ensure(ctx));else unwrap(await registry.forEngine(ctx,engine.id,true));
 if(!saved)await privateWrite(file,{version:1,projectId:ctx.projectId,engineId:engine.id,configHash:hash});
 console.info('Provisioning complete; matching configuration retained. Private manifest: '+file);
 });
 }finally{c.auth.close();}}

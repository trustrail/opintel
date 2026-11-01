import {publicProject} from './public-project.js';
/** Operator compatibility bootstrap through the same public APIs as the console. */
import {createHash} from 'node:crypto';
import {z} from 'zod';
import {matchingSettings} from './preconditions.js';
import {EnginePage} from '../../src/shared/api/engines.js';
import {CompanyListResponse,ProjectView} from '../../src/shared/api/tenancy-schemas.js';
import {TokenKeyView} from '../../src/shared/custody-contract.js';
import {ProjectSettings} from '../../src/shared/project-settings.js';
import {api,operatorConfig,required,locked,privateWrite,privateRead,provisionManifest,OperatorConflict} from './common.js';
export async function provision(){
 const config=operatorConfig.parse(JSON.parse(await privateRead(required('OPINTEL_OPERATOR_CONFIG'))));
 await api('/api/v1/auth/me');const companies=CompanyListResponse.parse(await api('/api/v1/companies?limit=100'));if(!companies.items.some(c=>c.id===config.companyId&&c.role==='admin'))throw new OperatorConflict('Company administrator required');
 const file=required('OPINTEL_PROVISION_MANIFEST');await locked(file,async()=>{
  const hash=createHash('sha256').update(JSON.stringify(config)).digest('hex');let saved;
  try{saved=provisionManifest.parse(JSON.parse(await privateRead(file)));if(saved.configHash!==hash)throw new OperatorConflict('Provisioning configuration conflict; existing decisions were preserved');}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
  const industries=z.array(z.object({id:z.uuid(),slug:z.string()})).parse(await api('/api/v1/industries')),industry=industries.find(i=>i.slug==='reinsurance-treaty');if(!industry)throw new OperatorConflict('Reinsurance industry is missing');
  // Only a project created and recorded by this operator run may be resumed.
  const project=saved?await publicProject(api,saved.projectId):await (async()=>{const created=ProjectView.parse(await api('/api/v1/projects','POST',{companyId:config.companyId,name:config.projectName,industryId:industry.id,region:config.region}));return {...created,company:{id:created.companyId}};})();
  if(project.company.id!==config.companyId||project.industry.id!==industry.id||project.region!==config.region||project.name!==config.projectName)throw new OperatorConflict('Project configuration conflict');
  const base='/api/v1/projects/'+project.id,current=z.object({settings:z.record(z.string(),z.unknown())}).parse(await api(base+'/settings')).settings,merged=matchingSettings(current,ProjectSettings.parse(config.settings));
  if(JSON.stringify(current)!==JSON.stringify(merged))await api(base+'/settings','PATCH',merged);
  let engines=EnginePage.parse(await api(base+'/engines?limit=100')).items;
  if(!engines.some(e=>e.address===new URL(config.engine.address).origin)){await api(base+'/engines','POST',config.engine);engines=EnginePage.parse(await api(base+'/engines?limit=100')).items;}
  const engine=engines.find(e=>e.address===new URL(config.engine.address).origin);if(!engine||engine.certificatePin!==config.engine.certificatePin.replaceAll(':','').toUpperCase()||saved&&saved.engineId!==engine.id)throw new OperatorConflict('Engine configuration conflict');
  if(!saved)await privateWrite(file,{version:1,projectId:project.id,engineId:engine.id,configHash:hash});
  if(!engine.verifiedAt)await api(base+'/engines/'+engine.id+'/verify','POST',{});if(!engine.custody)await api(base+'/engines/'+engine.id+'/custody','POST',{});
  if(TokenKeyView.parse(await api(base+'/token-key')).currentVersion===null)await api(base+'/token-key/initialize','POST',{});
  console.info('Provisioning complete through public APIs. Private manifest: '+file);
 });
}

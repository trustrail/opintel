import {privateRead} from '../../operator/private-input.js';
import {randomUUID} from 'node:crypto';
import {parseArgs} from 'node:util';
import {readFile,writeFile,mkdir,appendFile} from 'node:fs/promises';
import {join,resolve,isAbsolute} from 'node:path';
import {z} from 'zod';
import {cells,selectCells,verifierVersion,type Cell} from './registry.js';
import {schedule,MissingPrerequisite,type CellResult} from './scheduler.js';
import {report} from './report.js';
import {installationHttp} from './infrastructure/http.js';
import {customerSource} from './infrastructure/source.js';
import {setupV01} from '../../soak/public-setup.js';
import {custodyAgents} from '../../soak/custody.js';
import {cellExecutor} from './execute.js';
import {verificationEngine} from './infrastructure/engine.js';
import {CompanyListResponse,ProjectView} from '../../../src/shared/api/tenancy-schemas.js';
import {CustodyCheckResult} from '../../../src/shared/api/release-custody.js';
import {TokenKeyView} from '../../../src/shared/custody-contract.js';
const file=z.string().refine(isAbsolute,'Use absolute installation/input paths');
const configuration=z.strictObject({base:z.url(),gatewayDirectory:file,engineDirectory:file,cookieFile:file,targetFile:file,certificates:file,companyId:z.uuid().optional(),sourceName:z.string().default('v01'),sourceHost:z.string().optional(),xqApiKeyFile:file,custody:z.object({tenant:z.string().min(1),region:z.string().min(1)}),connectAddress:z.string().optional(),engineAddress:z.url().optional()});
const {values}=parseArgs({options:{config:{type:'string'},output:{type:'string'},all:{type:'boolean'},capability:{type:'string',multiple:true},cell:{type:'string',multiple:true},where:{type:'string',multiple:true},'random-seconds':{type:'string'},list:{type:'boolean'},help:{type:'boolean'}},strict:true});
if(values.help){console.info('Internal installation verifier '+verifierVersion+'\nverify --config PRIVATE_JSON --output DIRECTORY (--all | --capability NAME | --cell ID | --where DIMENSION=VALUE) [--random-seconds N]\nverify --list');process.exit(0);}
if(values.list){await new Promise<void>((resolve,reject)=>process.stdout.write(JSON.stringify(cells.map(({scenario:_scenario,...cell})=>cell),null,2)+'\n',error=>error?reject(error):resolve()));process.exit(0);}
let selected:Cell[];
try{selected=selectCells(values);}catch{console.error('Invalid cell selection; use --list.');process.exit(2);}
if(!values.config||!values.output){console.error('--config and --output are required');process.exit(2);}
const seconds=Number(values['random-seconds']??0);if(!Number.isSafeInteger(seconds)||seconds<0||seconds>86400)throw new Error('Random duration must be 0–86400 seconds');
const directory=resolve(values.output);await mkdir(directory,{recursive:true,mode:0o700});
const stop=new AbortController();process.on('SIGINT',()=>stop.abort());process.on('SIGTERM',()=>stop.abort());
const unavailable=new Map<string,string>();let installation:unknown=null,results:CellResult[]=[],devices:ReturnType<typeof custodyAgents>|undefined,executor:Awaited<ReturnType<typeof cellExecutor>>|undefined;
const record=async(value:unknown)=>appendFile(join(directory,'events.jsonl'),JSON.stringify(value)+'\n',{mode:0o600});
const checkpoint=async(current:CellResult[])=>{results=current;await report(directory,selected,results,installation,false);};
let boundary='installation',randomTraffic:{attempted:number;failed:number;seconds:number}|undefined;
try{
 await checkpoint([]);
 const config=configuration.parse(JSON.parse(await privateRead(values.config)));
 const artifact=z.object({name:z.literal('opintel-installation-verifier'),version:z.literal(verifierVersion),revision:z.string(),sourceHashes:z.record(z.string(),z.string())}).parse(JSON.parse(await readFile(new URL('./artifact.json',import.meta.url),'utf8')));
 const gateway=JSON.parse(await readFile(join(config.gatewayDirectory,'release.json'),'utf8')) as {revision:string;images:Record<string,string>;platform:string},engine=JSON.parse(await readFile(join(config.engineDirectory,'release.json'),'utf8')) as typeof gateway;
 if(!/^[a-f0-9]{40}$/u.test(gateway.revision)||gateway.revision!==engine.revision)throw new MissingPrerequisite('archive revisions differ');
 installation={verifier:{version:artifact.version,revision:artifact.revision,sourceHashes:artifact.sourceHashes},revision:gateway.revision,images:{gateway:gateway.images,engine:engine.images},platform:gateway.platform,identitySource:'installed archive release manifests'};
 boundary='session';
 const {call,fetcher}=await installationHttp(config.base,config.cookieFile,join(config.gatewayDirectory,'state/ca.pem'),config.connectAddress);
 await call('/api/v1/auth/me');
 boundary='fixture';
 const credentialRef=await customerSource(config.engineDirectory,config.targetFile,config.sourceName,directory,config.sourceHost);
 boundary='governance';
 let saved:{projectId:string;engineId:string}|undefined;try{saved=z.object({projectId:z.uuid(),engineId:z.uuid()}).parse(JSON.parse(await readFile(join(directory,'setup.json'),'utf8')));}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
 if(!saved){
  const companies=CompanyListResponse.parse(await call('/api/v1/companies?limit=100')).items.filter(c=>c.role==='admin'&&(!config.companyId||c.id===config.companyId));if(companies.length!==1)throw new MissingPrerequisite('choose one administered company');
  const industries=z.array(z.object({id:z.uuid(),slug:z.string()})).parse(await call('/api/v1/industries')),industry=industries.find(i=>i.slug==='reinsurance-treaty');if(!industry)throw new MissingPrerequisite('V-01 industry missing');
  const project=ProjectView.parse(await call('/api/v1/projects','POST',{companyId:companies[0]!.id,name:'Installation verification V-01 '+randomUUID().slice(0,8),industryId:industry.id,region:'us-east-1'}));
  const trust=z.object({address:z.url(),pin:z.string()}).parse(JSON.parse(await readFile(join(config.engineDirectory,'trust.json'),'utf8')));
  const engineId=await verificationEngine(call,project.id,trust,config.engineAddress);
  saved={projectId:project.id,engineId};await writeFile(join(directory,'setup.json'),JSON.stringify(saved),{mode:0o600,flag:'wx'});
 }
 const p=saved.projectId;
 await call(`/api/v1/projects/${p}/engines/${saved.engineId}/verify`,'POST',{});await call(`/api/v1/projects/${p}/engines/${saved.engineId}/custody`,'POST',{});
 // The company-admin fixture project is created by this tool; no existing
 // customer project's settings or governance are adopted or overwritten.
 const defaults=z.object({settings:z.record(z.string(),z.unknown())}).parse(await call(`/api/v1/projects/${p}/settings`)).settings;
 await call(`/api/v1/projects/${p}/settings`,'PATCH',{...defaults,query:{timeoutSeconds:30,rowLimit:1000,memoryLimitMb:256,concurrencyPerPool:2,aggregateMinGroupSize:5},custody:{provider:'xq',...config.custody},poolKeyGraceSeconds:3600});
 const key=TokenKeyView.parse(await call(`/api/v1/projects/${p}/token-key`));if(key.currentVersion===null)await call(`/api/v1/projects/${p}/token-key/initialize`,'POST',{});
 boundary='custody';
 const provider=CustodyCheckResult.parse(await call(`/api/v1/projects/${p}/custody-provider/check`,'POST',{}));if(!provider.reachable||!provider.authenticated||provider.failure)throw new MissingPrerequisite('custody provider check failed');
 const exchanges=new Map<number,{ok:boolean}>();devices=custodyAgents(config.certificates,(await privateRead(config.xqApiKeyFile)).trim(),()=>{},state=>{exchanges.set(state.certificateId,{ok:state.ok});});
 const associations=await devices.associations();if(associations.length!==4)throw new MissingPrerequisite('four certificate exchanges failed: '+[...exchanges].map(([id,state])=>id+':'+(state.ok?'ok':'failed')).join(', '));
 boundary='governance';
 const manifestFile=join(directory,'v01.json');await setupV01({projectId:p,engineId:saved.engineId,credentialRef,manifestFile,associations,call,lifecycle:true});
 executor=await cellExecutor({base:config.base,manifestFile,call,devices,exchanges,fetcher});
}catch(error){
 // Raw infrastructure errors may contain secrets or source values. Reports name
 // the failed boundary; individual cell diagnostics contain only safe checks.
 unavailable.set(boundary,'unavailable');
 console.error('Setup prerequisite unavailable: '+boundary);
 if(error instanceof MissingPrerequisite||error instanceof Error&&/^(Public API |V-01 |Catalogue |Four authorized )/u.test(error.message))console.error(error.message);
 if(error instanceof z.ZodError)console.error(JSON.stringify(error.issues.map(i=>({path:i.path,code:i.code}))));
}
try{
 await record({type:'start',selected:selected.map(c=>c.id)});
 const run=async(cell:Cell)=>{if(!executor)throw new MissingPrerequisite('setup incomplete');const actual=await executor.run(cell);await record({type:'query',cell:cell.id,outcome:actual.outcome,receiptId:actual.receiptId});if(actual.receiptId)await record({type:'receipt',cell:cell.id,id:actual.receiptId});return actual;};
 const outcome=await schedule(selected,run,{signal:stop.signal,unavailable,checkpoint});results=outcome.results;
 if(outcome.status==='passed'&&seconds>0){const start=Date.now();randomTraffic={attempted:0,failed:0,seconds};while(Date.now()-start<seconds*1000&&!stop.signal.aborted){const cell=selected[Math.floor(Math.random()*selected.length)]!;randomTraffic.attempted++;try{const result=await schedule([cell],run);if(result.status!=='passed')randomTraffic.failed++;}catch{randomTraffic.failed++;}}}
 const final=await report(directory,selected,results,installation,true,{...(randomTraffic?{randomTraffic}:{}),interrupted:stop.signal.aborted});
 console.info(`Selected ${final.counts.selected}: ${final.counts.passed} passed, ${final.counts.failed} failed, ${final.counts.notExercised} not exercised`);
 process.exitCode=final.status==='passed'&&!stop.signal.aborted&&!randomTraffic?.failed?0:1;
}finally{await executor?.close();await devices?.close();}

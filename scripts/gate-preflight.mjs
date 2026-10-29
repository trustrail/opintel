import process from 'node:process';
import console from 'node:console';
import {readFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath,URL} from 'node:url';

const exec=promisify(execFile);
const root=fileURLToPath(new URL('../',import.meta.url));
const services=[{name:'postgres',label:'Test PostgreSQL'},{name:'redis',label:'Redis'}];

export async function runPreflightCommand(command,args,timeout){
 const result=await exec(command,args,{cwd:root,timeout,killSignal:'SIGKILL',maxBuffer:64*1024});
 return result.stdout;
}

export class GatePrerequisiteError extends Error {}

const probeMessages=['PostgreSQL is not running','PostgreSQL authentication failed','Test PostgreSQL user needs CREATEDB','Redis is not running','Redis authentication failed'];
export async function probeGateService(service){
 try{await runPreflightCommand(process.execPath,['--import','tsx',fileURLToPath(new URL('gate-probe.ts',import.meta.url)),service],5000);}
 catch(error){
  const message=error.stdout?.trim();
  throw new GatePrerequisiteError(probeMessages.includes(message)?message:`${service==='postgres'?'PostgreSQL':'Redis'} did not accept connections within 5 seconds`);
 }
}

export async function pinnedGateImages(read=readFile){
 const upstream=JSON.parse(await read(new URL('../deploy/images/upstream.json',import.meta.url),'utf8'));
 const lock=JSON.parse(await read(new URL('../package-lock.json',import.meta.url),'utf8'));
 const images={};
 for(const service of ['postgres','redis','spicedb']){
  const image=upstream.services[service].image;
  if(typeof image!=='string'||!/@sha256:[a-f0-9]{64}$/u.test(image))throw new GatePrerequisiteError(`Test ${service} image must have a pinned digest in deploy/images/upstream.json`);
  images[service]=image;
 }
 const version=lock.packages['node_modules/@playwright/test'].version;
 if(!/^\d+\.\d+\.\d+$/u.test(version))throw new GatePrerequisiteError('Playwright version must be pinned in package-lock.json');
 images.browser=`mcr.microsoft.com/playwright:v${version}-noble`;
 return images;
}
export async function ensureGateImage(image,run=runPreflightCommand){
 try{return (await run('docker',['image','inspect',image,'--format','{{.Id}}'],5000)).trim();}
 catch{/* Pull the exact reference, never a mutable fallback. */}
 try{
  await run('docker',['pull',image],120000);
  return (await run('docker',['image','inspect',image,'--format','{{.Id}}'],5000)).trim();
 }catch{throw new GatePrerequisiteError(`Image ${image} missing and could not be pulled; run docker pull ${image}`);}
}
export async function testContainerImage(service){
 const images=await pinnedGateImages();
 if(!['postgres','redis','spicedb'].includes(service))throw new GatePrerequisiteError('Unknown test container service');
 return ensureGateImage(images[service]);
}
export function postgresFailure(error){
 const codes=error instanceof AggregateError?error.errors.map(item=>item?.code):[error?.code];
 if(codes.includes('ECONNREFUSED'))return 'PostgreSQL is not running';
 if(codes.some(code=>['ENOTFOUND','ETIMEDOUT','EHOSTUNREACH'].includes(code)))return 'PostgreSQL is unreachable; check the configured test endpoint';
 if(codes.some(code=>['28P01','28000'].includes(code)))return 'PostgreSQL authentication failed';
 if(codes.includes('42501'))return 'Test PostgreSQL user needs CREATEDB';
 return 'Test PostgreSQL could not create the isolated database; inspect local PostgreSQL logs';
}
export function bootstrapFailure(error,stage){
 if(error instanceof GatePrerequisiteError)return error.message;
 const code=error?.code;
 const causes={ECONNREFUSED:'connection refused',ENOENT:'required file or executable missing',ENOSPC:'disk full',EACCES:'permission denied',MODULE_NOT_FOUND:'required module missing',ERR_MODULE_NOT_FOUND:'required module missing','28P01':'PostgreSQL authentication failed','42501':'PostgreSQL privilege denied','3D000':'test database missing','55P03':'database lock timeout','57014':'database statement cancelled'};
 const cause=causes[code]??(Number.isInteger(code)?`command exited with status ${code}`:'unexpected failure; inspect local service logs');
 return `Normal-test bootstrap failed at ${stage}: ${cause}`;
}

export function parseAvailableMemory(platform,output){
 let bytes;
 if(platform==='darwin'){
  const pageSize=output.match(/page size of (\d+) bytes/u);
  const pages=['free','inactive','speculative'].map(name=>output.match(new RegExp(`^Pages ${name}:\\s+(\\d+)\\.`, 'mu')));
  if(pageSize&&pages.every(Boolean)&&Number(pageSize[1])>0)bytes=pages.reduce((sum,match)=>sum+Number(match[1]),0)*Number(pageSize[1]);
 }else if(platform==='linux'){
  const available=output.match(/^MemAvailable:\s+(\d+)\s+kB$/mu);
  if(available)bytes=Number(available[1])*1024;
 }
 if(!Number.isSafeInteger(bytes)||bytes<0)throw new Error('Gate memory preflight: cannot determine available RAM.');
 return bytes;
}

export async function availableMemory({platform=process.platform,run=runPreflightCommand,read=readFile}={}){
 try{
  if(platform==='darwin')return parseAvailableMemory(platform,await run('/usr/bin/vm_stat',[],5000));
  if(platform==='linux')return parseAvailableMemory(platform,await read('/proc/meminfo','utf8'));
 }catch{throw new Error('Gate memory preflight: cannot determine available RAM.');}
 throw new Error('Gate memory preflight: available RAM measurement supports macOS and Linux only.');
}

export async function gatePreflight({run=runPreflightCommand,probe=probeGateService,memory=availableMemory,images=pinnedGateImages}={}){
 const minimumAvailableBytes=1024**3,availableBytes=await memory();
 if(!Number.isFinite(availableBytes)||availableBytes<0)throw new GatePrerequisiteError('Gate memory preflight: cannot determine available RAM.');
 if(availableBytes<minimumAvailableBytes)throw new GatePrerequisiteError(`Gate memory preflight: ${(availableBytes/1024**3).toFixed(2)} GiB available RAM; at least 1 GiB required. Free host memory before starting the gate.`);
 console.info(`Gate memory preflight: ${(availableBytes/1024**3).toFixed(2)} GiB available RAM; minimum 1 GiB.`);
 let dockerBytes;
 try{dockerBytes=Number((await run('docker',['info','--format','{{.MemTotal}}'],5000)).trim());}
 catch{throw new GatePrerequisiteError('Docker is not running; start Docker Desktop');}
 if(!Number.isSafeInteger(dockerBytes)||dockerBytes<=0)throw new GatePrerequisiteError('Docker memory could not be determined; check Docker Desktop');
 const minimumDockerBytes=7*1024**3;
 if(dockerBytes<minimumDockerBytes)throw new GatePrerequisiteError(`Docker has ${(dockerBytes/1024**3).toFixed(2)} GiB, needs at least 7 GiB usable (allocate 8 GB in Docker Desktop)`);
 console.info(`Docker memory: ${(dockerBytes/1024**3).toFixed(2)} GiB; minimum 7 GiB usable.`);
 const requiredImages=await images();
 const imageResults=await Promise.allSettled(Object.values(requiredImages).map(image=>ensureGateImage(image,run)));
 const imageFailures=imageResults.filter(result=>result.status==='rejected');
 if(imageFailures.length)throw new GatePrerequisiteError(imageFailures.map(result=>result.reason.message).join('; '));
 let running;
 try{running=new Set((await run('docker',['compose','ps','--status','running','--services'],5000)).trim().split(/\s+/u));}
 catch{throw new GatePrerequisiteError('Test PostgreSQL and Redis: Docker Compose service inspection failed or exceeded 5 seconds. Start Docker Desktop.');}
 const missing=services.filter(service=>!running.has(service.name));
 if(missing.length){
  try{await run('docker',['compose','up','-d','--no-deps','--no-recreate','--pull','never',...missing.map(service=>service.name)],5000);}
  catch{/* Probes below determine whether startup actually made services ready. */}
 }
 // Independent workers enforce a hard deadline even if a driver handshake hangs.
 const results=await Promise.allSettled(services.map(service=>probe(service.name)));
 const failures=services.flatMap((service,index)=>{
  const result=results[index];
  return result.status==='rejected'?[result.reason instanceof GatePrerequisiteError?result.reason.message:`${service.name==='postgres'?'PostgreSQL':'Redis'} is not running or did not accept connections within 5 seconds`]:[];
 });
 if(failures.length)throw new GatePrerequisiteError(failures.join('; '));
 return {memory:{availableBytes,minimumAvailableBytes},docker:{bytes:dockerBytes,minimumBytes:minimumDockerBytes},images:requiredImages,started:missing.map(service=>service.name),postgres:'reachable',redis:'reachable'};
}

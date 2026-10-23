import process from 'node:process';
import console from 'node:console';
import {spawnSync} from 'node:child_process';
import {readFileSync,readdirSync,statfsSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {selectedImages,targetPlatforms,runtimeBase} from './build-plan.mjs';

function run(command,args,options={}){
 const result=spawnSync(command,args,{stdio:'inherit',...options});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${command} failed with exit ${result.status??'signal'}`);
 return result;
}
const targets=selectedImages(process.env.IMAGE),platforms=targetPlatforms(process.env.PLATFORM);
const minimumGiB=Number(process.env.BUILD_MIN_FREE_GIB??(platforms.length>1?8:4));
if(!Number.isFinite(minimumGiB)||minimumGiB<1)throw new Error('BUILD_MIN_FREE_GIB must be at least 1.');
const disk=statfsSync('.'),minimum=minimumGiB*1024**3;
if(disk.bavail*disk.bsize<minimum)throw new Error(`Build needs at least ${minimum/1024**3} GiB free on the host; no images were built.`);
const sha=run('git',['rev-parse','HEAD'],{stdio:'pipe',encoding:'utf8'}).stdout.trim();
const dirty=run('git',['status','--porcelain','--untracked-files=all'],{stdio:'pipe',encoding:'utf8'}).stdout.trim().length>0;
const candidate=process.env.BUILD_CANDIDATE==='1';
if(dirty&&!candidate)throw new Error('Release builds require a clean checkout. Use BUILD_CANDIDATE=1 for explicitly tagged validation artifacts.');
const tag=process.env.TAG??(candidate?'candidate-':'')+sha.slice(0,12),prefix=process.env.IMAGE_PREFIX??'opintel';
if(candidate&&!tag.startsWith('candidate-'))throw new Error('Candidate builds must use a candidate- tag.');
if(!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/u.test(tag)||!/^[a-z0-9][a-z0-9./:_-]*$/u.test(prefix))throw new Error('Invalid TAG or IMAGE_PREFIX.');
const lock=JSON.parse(readFileSync('deploy/images/upstream.json','utf8')),upstream=lock['x-build-images'];
for(const ref of [...Object.values(upstream),...Object.values(lock.services).map(s=>s.image)])if(!/^\S+@sha256:[a-f0-9]{64}$/u.test(ref))throw new Error('Every upstream image must have a digest.');
run('python3',['scripts/images/check-secrets.py','--self-test']);
run('python3',['scripts/images/check-runtime.py','--self-test']);
const common=['buildx','build','--file','deploy/engine/Dockerfile','--label',`org.opencontainers.image.revision=${sha}`,'--label',`io.opintel.candidate=${candidate}`,'--build-arg',`NODE_RUNTIME_IMAGE=${upstream.nodeRuntime}`,'--build-arg',`NODE_BUILD_IMAGE=${upstream.nodeBuild}`,'--build-arg',`OS_RUNTIME_IMAGE=${upstream.osRuntime}`,'--output','type=image,store=true'];
const dependencies=JSON.parse(readFileSync('package.json','utf8')).dependencies;
const engineBuild=/queryEngineBuild='([^']+)'/u.exec(readFileSync('sidecar/sql/application/engine-build.ts','utf8'))?.[1];
const contract=Number(/contract: (\d+)/u.exec(readFileSync('sidecar/http/server.ts','utf8'))?.[1]);
if(!engineBuild||!Number.isInteger(contract))throw new Error('Cannot identify the engine build/contract for release provenance.');
const migrationIdentities=Object.fromEntries(readdirSync('migrations').filter(name=>/\.up\.(?:sql|ts)$/u.test(name)).sort().map(name=>[name,createHash('sha256').update(readFileSync('migrations/'+name)).digest('hex')]));
const bases=new Map(),artifacts=[];
for(const target of targets){
 for(const platform of platforms){
  const baseTarget=runtimeBase(target),baseKey=baseTarget+platform;
  let base=bases.get(baseKey);
  if(!base){base=`${prefix}-${baseTarget}:${tag}-${platform.replace('/','-')}`;run('docker',[...common,'--target',baseTarget,'--platform',platform,'--tag',base,'.']);bases.set(baseKey,base);}
  const image=`${prefix}-${target}:${tag}-${platform.replace('/','-')}`;
  run('docker',[...common,'--target',target,'--platform',platform,'--tag',image,...(platforms.length===1?['--tag',`${prefix}-${target}:${tag}`]:[]),'.']);
  run('python3',['scripts/images/check-secrets.py',image,platform]);
  run('python3',['scripts/images/check-runtime.py',image,platform,target,base]);
  const info=JSON.parse(run('docker',['image','inspect','--platform',platform,image],{stdio:'pipe',encoding:'utf8'}).stdout)[0];
  const runtime=JSON.parse(run('docker',['run','--rm','--network','none','--read-only','--platform',platform,image,'node','-e','process.stdout.write(require("node:fs").readFileSync("/work/runtime-manifest.json"))'],{stdio:'pipe',encoding:'utf8'}).stdout);
  artifacts.push({target,platform,image,id:info.Id,repoDigests:info.RepoDigests??[],runtimeBase:base,runtime});
 }
 if(platforms.length>1)run('docker',[...common,'--target',target,'--platform',platforms.join(','),'--tag',`${prefix}-${target}:${tag}`,'.']);
}
mkdirSync('tmp/images/releases',{recursive:true});
writeFileSync(`tmp/images/releases/${tag}-${targets.join('-')}.json`,JSON.stringify({revision:sha,candidate,dirty,tag,platforms,upstream:lock,compatibility:{engineContract:contract,queryEngineBuild:engineBuild,duckdbBinding:dependencies['@duckdb/node-api'],migrationIdentities},artifacts},null,2)+'\n');
console.log(`Verified ${artifacts.length} selected platform images; tag ${tag}${platforms.length>1?' also names each multi-architecture manifest':''}.`);

import process from 'node:process';
import console from 'node:console';
import {spawnSync} from 'node:child_process';
import {readFileSync,statfsSync} from 'node:fs';

function run(command,args,options={}){
 const result=spawnSync(command,args,{stdio:'inherit',...options});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${command} failed with exit ${result.status??'signal'}`);
 return result;
}
const platforms=(process.env.PLATFORM??'linux/amd64,linux/arm64').split(',');
if(!platforms.length||new Set(platforms).size!==platforms.length||platforms.some(p=>!['linux/amd64','linux/arm64'].includes(p)))throw new Error('PLATFORM must be linux/amd64, linux/arm64, or their comma-separated pair.');
const minimumGiB=Number(process.env.BUILD_MIN_FREE_GIB??(platforms.length>1?8:4));
if(!Number.isFinite(minimumGiB)||minimumGiB<1)throw new Error('BUILD_MIN_FREE_GIB must be at least 1.');
const disk=statfsSync('.'),minimum=minimumGiB*1024**3;
if(disk.bavail*disk.bsize<minimum)throw new Error(`Build needs at least ${minimum/1024**3} GiB free on the host; no images were built.`);
const revision=spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'});
if(revision.status!==0)throw new Error('Cannot resolve the source revision.');
const sha=revision.stdout.trim(),tag=process.env.TAG??sha.slice(0,12),prefix=process.env.IMAGE_PREFIX??'opintel';
if(!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,127}$/u.test(tag)||!/^[a-z0-9][a-z0-9./:_-]*$/u.test(prefix))throw new Error('Invalid TAG or IMAGE_PREFIX.');
const lock=JSON.parse(readFileSync('deploy/images/upstream.json','utf8'));
const upstream=lock['x-build-images'];
for(const ref of [...Object.values(upstream),...Object.values(lock.services).map(s=>s.image)])if(!/^\S+@sha256:[a-f0-9]{64}$/u.test(ref))throw new Error('Every upstream image must have a digest.');
run('python3',['scripts/images/check-secrets.py','--self-test']);
const checks=[];
for(const target of ['api','engine','console','egress']){
 const common=['buildx','build','--file','deploy/engine/Dockerfile','--target',target,'--label',`org.opencontainers.image.revision=${sha}`,'--build-arg',`NODE_RUNTIME_IMAGE=${upstream.nodeRuntime}`,'--build-arg',`NODE_BUILD_IMAGE=${upstream.nodeBuild}`,'--output','type=image,store=true'];
 for(const platform of platforms){
  const image=`${prefix}-${target}:${tag}-${platform.replace('/','-')}`;
  run('docker',[...common,'--platform',platform,'--tag',image,...(platforms.length===1?['--tag',`${prefix}-${target}:${tag}`]:[]),'.']);
  checks.push(image,platform);
 }
 if(platforms.length>1)run('docker',[...common,'--platform',platforms.join(','),'--tag',`${prefix}-${target}:${tag}`,'.']);
}
run('python3',['scripts/images/check-secrets.py',...checks]);
console.log(`Verified ${checks.length/2} platform images; tag ${tag}${platforms.length>1?' also names each multi-architecture manifest':''}.`);

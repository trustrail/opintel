import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync,mkdirSync,cpSync,readdirSync,chmodSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function packageDeployment(manifest,destination,platform,{candidate=false}={}){
 if(!['linux/amd64','linux/arm64'].includes(platform))throw new Error('Select one supported package platform.');
 if(!/^[a-f0-9]{40}$/u.test(manifest.revision??''))throw new Error('Release revision is missing.');
 if((manifest.candidate||manifest.dirty)&&!candidate)throw new Error('Dirty candidate artifacts cannot be packaged as a release.');
 if(existsSync(destination))throw new Error('Package output already exists; use a new directory.');
 const images={};
 for(const target of ['api','console','engine','egress','migrations','provisioning','demo-tools']){
  const matches=manifest.artifacts.filter(value=>value.target===target&&value.platform===platform);
  if(matches.length!==1)throw new Error('Missing or ambiguous image artifact: '+target);
  const digest=matches[0].repoDigests?.find(value=>/^[a-z0-9./:_-]+@sha256:[a-f0-9]{64}$/u.test(value));
  if(!digest)throw new Error('Image has no immutable digest: '+target);
  images[target]=digest;
 }
 for(const service of Object.values(manifest.upstream?.services??{}))if(!/@sha256:[a-f0-9]{64}$/u.test(service.image))throw new Error('Upstream image is not digest-pinned.');
 for(const service of ['postgres','redis','spicedb'])if(!manifest.upstream?.services?.[service])throw new Error('Missing pinned upstream service.');
 mkdirSync(destination,{recursive:true});
 for(const [name,source] of [['gateway','deploy/gateway'],['engine','deploy/engine-package']]){
  const output=join(destination,name);mkdirSync(join(output,'services'),{recursive:true});
  cpSync(join(source,'README.md'),join(output,'README.md'));
  cpSync(join(source,name+'.sh'),join(output,name+'.sh'));chmodSync(join(output,name+'.sh'),0o755);
  for(const file of readdirSync(join(source,'services'))){
   const config=JSON.parse(readFileSync(join(source,'services',file),'utf8'));
   for(const [service,body] of Object.entries(config.services)){
    body.platform=platform;
    if(body.extends)body.extends.file='../upstream.json';
    if(body.image){const target=service==='prepare'?'engine':['owner-claim','provision'].includes(service)?'provisioning':service==='schema'?'migrations':service;body.image=images[target];if(!body.image)throw new Error('Unmapped image target.');}
   }
   writeFileSync(join(output,'services',file),JSON.stringify(config,null,2)+'\n');
  }
  if(name==='gateway')cpSync('docs/ops/run-soak.md',join(output,'run-soak.md'));
  if(name==='gateway')writeFileSync(join(output,'upstream.json'),JSON.stringify({services:manifest.upstream.services},null,2)+'\n');
  writeFileSync(join(output,'release.json'),JSON.stringify({revision:manifest.revision,platform,candidate:!!(manifest.candidate||manifest.dirty),images:Object.fromEntries(Object.entries(images).filter(([target])=>name==='engine'?['engine','egress'].includes(target):!['engine','egress'].includes(target)))},null,2)+'\n');
 }
 return {platform,images,destination};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [file,output,...flags]=process.argv.slice(2);
 if(!file||!output||flags.some(flag=>flag!=='--candidate'))throw new Error('Usage: package.mjs RELEASE_JSON NEW_OUTPUT_DIRECTORY [--candidate]');
 const result=packageDeployment(JSON.parse(readFileSync(file,'utf8')),resolve(output),process.env.PLATFORM??'linux/amd64',{candidate:flags.includes('--candidate')});
 console.log('Created independent digest-pinned packages: '+result.destination);
}

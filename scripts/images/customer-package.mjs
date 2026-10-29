import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync,copyFileSync,chmodSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {packageDeployment} from './package.mjs';
import {auditPackage,auditCustomerEnvironment} from './package-audit.mjs';
const [manifestFile,destination,...flags]=process.argv.slice(2);const candidate=flags.length===1&&flags[0]==='--candidate';if(flags.length&&!candidate)throw new Error('Unknown package flag.');
if(!manifestFile||!destination)throw new Error('Usage: customer-package.mjs PUBLISHED_MANIFEST NEW_DIRECTORY');
const manifest=JSON.parse(readFileSync(manifestFile,'utf8')),platform=process.env.PLATFORM;
if(!manifest.publishedAt&&!candidate)throw new Error('Customer archives require a published manifest.');
const output=resolve(destination);packageDeployment(manifest,output,platform,{candidate});
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8',timeout:600000,maxBuffer:4*1024*1024});if(r.status!==0)throw new Error('Offline archive Docker step failed: '+args[0]);return r.stdout.trim();}
for(const kind of ['gateway','engine']){
 const directory=join(output,kind);rmSync(join(directory,kind+'.sh'));if(kind==='gateway')rmSync(join(directory,'run-soak.md'));const release=JSON.parse(readFileSync(join(directory,'release.json'),'utf8'));release.customerPackageVersion=1;writeFileSync(join(directory,'release.json'),JSON.stringify(release,null,2)+'\n');
 const provisioning=manifest.artifacts.find(a=>a.target==='provisioning'&&a.platform===platform)?.repoDigests[0];
 if(!provisioning)throw new Error('Installer image missing.');
 const upstream=Object.fromEntries(Object.entries(manifest.upstream.services).filter(([name])=>kind==='gateway'||name==='postgres'));
 writeFileSync(join(directory,'upstream.json'),JSON.stringify({services:upstream},null,2)+'\n');
 const refs=[...new Set([...Object.values(release.images),provisioning,...Object.values(upstream).map(s=>s.image)])];
 const map={},inventory=[];
 for(const ref of refs){
  if(spawnSync('docker',['image','inspect','--platform',platform,ref],{stdio:'ignore'}).status!==0)docker(['pull','--platform',platform,ref]);
  const info=JSON.parse(docker(['image','inspect','--platform',platform,ref]))[0];
  const tag='opintel-package/'+ref.split('@')[0].split('/').at(-1).split(':')[0]+':'+ref.split('@sha256:')[1]+'-'+platform.split('/')[1];
  docker(['tag',ref,tag]);map[ref]=tag;inventory.push({digest:ref,image:tag,id:info.Id});
 }
 writeFileSync(join(directory,'local-images.json'),JSON.stringify(map,null,2)+'\n');
 writeFileSync(join(directory,'images.list'),inventory.map(i=>i.image+' '+i.id).join('\n')+'\n');
 writeFileSync(join(directory,'image-provenance.json'),JSON.stringify({platform,revision:manifest.revision,images:inventory},null,2)+'\n');
 writeFileSync(join(directory,'bootstrap.image'),map[provisioning]+'\n');writeFileSync(join(directory,'platform'),platform+'\n');writeFileSync(join(directory,'package-kind'),kind+'\n');
 for(const command of ['install','start','stop','status','upgrade','backup','restore',...(kind==='gateway'?['owner-claim','invite','users','xq-check','mail-test','demo','identities','register-engine']:['pairing-code','sources'])]){
  copyFileSync('deploy/customer/command',join(directory,command));chmodSync(join(directory,command),0o755);
 }
 copyFileSync('deploy/customer/'+kind+'-README.md',join(directory,'README.md'));
 if(kind==='gateway'){copyFileSync('deploy/customer/gateway-DEMO.md',join(directory,'DEMO.md'));copyFileSync('deploy/customer/package.env.example',join(directory,'package.env'));chmodSync(join(directory,'package.env'),0o600);}
 auditPackage(directory);
 docker(['image','save','--platform',platform,'--output',join(directory,'images.tar'),...inventory.map(i=>i.image)]);
 auditPackage(directory);
 const archive=join(output,kind+'-'+manifest.revision.slice(0,7)+'-'+platform.split('/')[1]+'.tar.gz');
 const tar=spawnSync('tar',['-czf',archive,'-C',output,kind],{stdio:'inherit',timeout:600000,env:{...process.env,LC_ALL:'C'}});if(tar.status!==0)throw new Error('Package archive failed.');
 if(kind==='gateway'){const packed=spawnSync('tar',['-xOf',archive,'gateway/package.env'],{encoding:'utf8',timeout:60000});if(packed.status!==0)throw new Error('Cannot audit archived customer environment.');auditCustomerEnvironment(packed.stdout);}
 console.log('Customer archive: '+archive);
}

import process from 'node:process';
import console from 'node:console';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const [input,output,...flags]=process.argv.slice(2);
if(!input||!output||flags.some(flag=>flag!=='--candidate'))throw new Error('Usage: publish.mjs BUILD_MANIFEST PUBLISHED_MANIFEST [--candidate]');
const manifest=JSON.parse(readFileSync(input,'utf8'));
if((manifest.candidate||manifest.dirty)&&!flags.includes('--candidate'))throw new Error('Candidate publication requires --candidate; it remains marked as a candidate.');
if(!/^[a-zA-Z0-9_][a-zA-Z0-9_.-]{0,100}$/u.test(manifest.tag))throw new Error('Invalid release tag');
const targets=['api','engine','console','egress','migrations','provisioning'];
function exec(args){const result=spawnSync('docker',args,{encoding:'utf8',timeout:600000,maxBuffer:8*1024*1024});if(result.error||result.status!==0)throw new Error(`Docker ${args[0]} failed (${result.status}); no release manifest written. ${result.stderr?.trim()??''}`);return result.stdout;}
const artifacts=[];
for(const artifact of manifest.artifacts){
 if(!targets.includes(artifact.target)||!['linux/amd64','linux/arm64'].includes(artifact.platform))throw new Error('Unexpected artifact');
 const info=JSON.parse(exec(['image','inspect','--platform',artifact.platform,artifact.image]))[0];
 if(info.Id!==artifact.id)throw new Error('Image changed since its audited build');
 const repository=`ghcr.io/trustrail/opintel-${artifact.target}`,image=`${repository}:${manifest.tag}-${artifact.platform.replace('/','-')}`;
 const hash=artifact.repoDigests?.[0]?.split('@')[1];
 if(!/^sha256:[a-f0-9]{64}$/u.test(hash??''))throw new Error('Audited artifact digest missing');
 const digest=repository+'@'+hash;
 const existing=spawnSync('docker',['buildx','imagetools','inspect',digest],{encoding:'utf8',timeout:60000});
 if(existing.status!==0){
  console.log('Publishing '+artifact.target+' '+artifact.platform);
  exec(['tag',artifact.image,image]);exec(['push',image]);
 }
 exec(['buildx','imagetools','inspect',digest]);
 artifacts.push({...artifact,image,repoDigests:[digest]});console.log(`${artifact.target} ${artifact.platform} ${digest}`);
}
writeFileSync(output,JSON.stringify({...manifest,publishedAt:new Date().toISOString(),artifacts},null,2)+'\n',{flag:'wx'});
console.log('Published manifest: '+output);

import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {existsSync,readFileSync,writeFileSync,appendFileSync,realpathSync} from 'node:fs';
import {join,resolve,relative,isAbsolute} from 'node:path';
import {captureProcessLog} from './acceptance-log.mjs';

/** Own only this run's labels or fresh package projects. Never prune a daemon. */
export function createAcceptanceLab({directory,env=process.env,run=spawnSync,capture=(args,file)=>captureProcessLog('docker',args,file,{env,timeout:30000})}){
 const id=randomUUID(),label='io.opintel.acceptance-run='+id,roots=new Set(),projects=new Set();
 let result;
 const privateFile=(name,value)=>writeFileSync(join(directory,name),JSON.stringify(value,null,2)+'\n',{mode:0o600});
 function trackProject(project){if(!/^opintel[-a-z0-9_]+$/u.test(project))throw new Error('Acceptance cleanup requires a generated Opintel project name.');projects.add(project);}
 function trackCompose(root){const child=relative(resolve(directory),resolve(root));if(!child||isAbsolute(child)||child==='..'||child.startsWith('../'))throw new Error('Acceptance compose root must be inside this run directory.');roots.add(root);}
 function cleanup(){
  if(result)return result;
  result={id,status:'passed',removed:{containers:0,volumes:0,networks:0},failures:[]};
  const failure=(operation,code)=>{result.status='failed';result.failures.push({operation,code});};
  const command=(args,retainOutput=true,allowMissing=false)=>{let response;try{response=run('docker',args,{env,encoding:'utf8',timeout:60000,maxBuffer:4*1024*1024});}catch{failure(args.slice(0,2).join(' '),'spawn_failed');return null;}
   try{appendFileSync(join(directory,'lab-cleanup.private.log'),JSON.stringify({args,status:response.status,errorCode:response.error?.code??null,stdout:retainOutput?response.stdout??'':'[ownership metadata inspected locally]',stderr:response.stderr??''})+'\n',{mode:0o600});}catch{failure('retain cleanup log','write_failed');}
   const missingOnly=allowMissing&&!response.error&&response.status===1&&(response.stderr??'').trim().split('\n').every(line=>/No such (?:object|container):/u.test(line));
   if(!missingOnly&&(response.error||response.status!==0)){failure(args.slice(0,2).join(' '),response.error?.code??response.status??'signal');return null;}return (response.stdout??'').trim();};
  const removeContainers=ids=>{if(!ids.length)return;for(const container of ids){try{capture(['logs',container],join(directory,'lab-container-'+container+'.log'));}catch{failure('retain container log','capture_failed');}}
   if(command(['rm','--force','--volumes',...ids])!==null)result.removed.containers+=ids.length;};
  try{
   for(const root of roots){const file=join(root,'state/project-name');if(existsSync(file)){try{trackProject(readFileSync(file,'utf8').trim());}catch{failure('read owned project','invalid_project');}}}
   const selectors=[label,...[...projects].map(project=>'com.docker.compose.project='+project)],networkModes=new Set();
   for(const selector of selectors){const found=command(['network','ls','--filter','label='+selector,'--format','{{.ID}} {{.Name}}']);if(found)for(const line of found.split('\n'))for(const value of line.split(/\s+/u))networkModes.add(value);}
   // Shipped one-shot commands may have no custom label. A bind mount into
   // this fresh run directory is ownership proof; never retain foreign mounts.
   const all=command(['ps','--all','--quiet','--no-trunc'],false);
   if(all){const ids=all.split(/\s+/u),mounts=command(['inspect','--format','{"id":{{json .Id}},"network":{{json .HostConfig.NetworkMode}},"mounts":{{json .Mounts}}}',...ids],false,true);let root;try{root=realpathSync(directory);}catch{root=resolve(directory);}
    if(mounts){const owned=[];for(const line of mounts.split('\n')){try{const metadata=JSON.parse(line),id=metadata.id,values=metadata.mounts,ownedNetwork=[...networkModes].some(mode=>metadata.network===mode||/^[a-f0-9]{12,64}$/u.test(mode)&&metadata.network?.startsWith(mode));if(ids.includes(id)&&(ownedNetwork||Array.isArray(values)&&values.some(mount=>{
     if(mount.Type!=='bind'||typeof mount.Source!=='string')return false;let source=process.platform==='darwin'?mount.Source.replace(/^\/host_mnt(?=\/)/u,''):mount.Source;
     try{source=realpathSync(source);}catch{source=resolve(source);}const child=relative(root,source);return !isAbsolute(child)&&child!=='..'&&!child.startsWith('../');
    })))owned.push(id);}catch{failure('read mount ownership','invalid_response');}}
    removeContainers(owned);}
   }
   for(const selector of selectors){
    const networks=command(['network','ls','--filter','label='+selector,'--format','{{.ID}}']),ids=new Set();
    const containers=command(['ps','--all','--quiet','--filter','label='+selector]);if(containers)for(const id of containers.split(/\s+/u))ids.add(id);
    if(networks)for(const network of networks.split(/\s+/u)){const attached=command(['ps','--all','--quiet','--filter','network='+network]);if(attached)for(const id of attached.split(/\s+/u))ids.add(id);}
    removeContainers([...ids]);
    for(const [type,format,key] of [['volume','{{.Name}}','volumes'],['network','{{.ID}}','networks']]){
     const found=command([type,'ls','--filter','label='+selector,'--format',format]);
     if(found&&command([type,'rm',...found.split(/\s+/u)])!==null)result.removed[key]+=found.split(/\s+/u).length;
    }
   }
  }finally{
   process.removeListener('exit',onExit);process.removeListener('SIGINT',onInterrupt);process.removeListener('SIGTERM',onTerminate);
   try{privateFile('lab-cleanup.json',result);}catch{failure('retain cleanup result','write_failed');}if(result.status!=='passed'&&!process.exitCode)process.exitCode=1;
  }
  return result;
 }
 const onExit=()=>cleanup(),onInterrupt=()=>process.exit(130),onTerminate=()=>process.exit(143);
 process.once('exit',onExit);process.once('SIGINT',onInterrupt);process.once('SIGTERM',onTerminate);
 privateFile('lab-ownership.json',{id,label});
 return {id,labelArgs:['--label',label],trackCompose,trackProject,cleanup};
}

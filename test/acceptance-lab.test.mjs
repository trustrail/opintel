import {it,expect} from 'vitest';
import {mkdtempSync,rmSync,readFileSync,statSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {createAcceptanceLab} from '../scripts/images/acceptance-lab.mjs';

it('cleanup retains logs, removes only owned labels/projects, continues after failure and is idempotent',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-lab-')),calls=[],captures=[],previous=process.exitCode;
 const root=join(directory,'gateway');mkdirSync(join(root,'state'),{recursive:true});writeFileSync(join(root,'state/project-name'),'opintel-gateway-fixture');
 const run=(_binary,args)=>{calls.push(args);if(args[0]==='ps')return {status:0,stdout:'owned-container'};if(args[1]==='ls')return {status:0,stdout:'owned-'+args[0]};return {status:args[0]==='rm'?1:0,stdout:''};};
 const lab=createAcceptanceLab({directory,run,capture:(args,file)=>captures.push({args,file})});
 try{
  lab.trackCompose(root);expect(()=>lab.trackCompose(resolve(directory,'..'))).toThrow();expect(()=>lab.trackProject('opintel')).toThrow();
  const result=lab.cleanup(),count=calls.length;expect(result.status).toBe('failed');expect(result.failures).toHaveLength(2);expect(result.removed).toEqual({containers:0,volumes:2,networks:2});
  expect(captures).toHaveLength(2);expect(calls.filter(args=>args[0]==='rm').every(args=>args.includes('--volumes'))).toBe(true);
  expect(calls.filter(args=>args.includes('--filter')).every(args=>args.includes('label='+lab.labelArgs[1])||args.includes('label=com.docker.compose.project=opintel-gateway-fixture')||args.includes('network=owned-network'))).toBe(true);
  expect(calls.flat()).not.toContain('prune');expect(lab.cleanup()).toBe(result);expect(calls).toHaveLength(count);
  expect(statSync(join(directory,'lab-cleanup.json')).mode&0o777).toBe(0o600);
 }finally{process.exitCode=previous;lab.cleanup();rmSync(directory,{recursive:true,force:true});}
});

it.each(['success','failure'])('real Docker lab removes its containers, anonymous/named volumes and networks after %s',outcome=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-lab-real-')),controlDirectory=mkdtempSync(join(tmpdir(),'acceptance-lab-control-'));
 const lab=createAcceptanceLab({directory}),control=createAcceptanceLab({directory:controlDirectory}),name='opintel-lab-'+lab.id,other='opintel-lab-'+control.id;
 const image=JSON.parse(readFileSync('deploy/images/upstream.json','utf8')).services.redis.image;
 const docker=args=>{const response=spawnSync('docker',args,{encoding:'utf8',timeout:30000});if(response.error||response.status!==0)throw new Error('Lab fixture Docker '+args[0]+' failed');return response.stdout.trim();};
 let mounts=[];
 try{
  docker(['volume','create',...control.labelArgs,other]);
  try{
   docker(['volume','create',...lab.labelArgs,name]);docker(['network','create',...lab.labelArgs,name]);
   docker(['create',...lab.labelArgs,'--name',name,'--network',name,'--mount','type=volume,source='+name+',target=/data','--volume','/scratch',image]);
   docker(['create','--name',name+'-network','--network',name,image]);
   docker(['create','--name',name+'-bind','--network','none','--mount','type=bind,source='+directory+',target=/acceptance,readonly',image]);
   mounts=JSON.parse(docker(['inspect',name,name+'-network',name+'-bind'])).flatMap(container=>container.Mounts.filter(m=>m.Type==='volume').map(m=>m.Name));
   if(outcome==='failure')throw new Error('Deliberate acceptance failure');
  }catch(error){expect(outcome).toBe('failure');expect(error.message).toBe('Deliberate acceptance failure');}finally{expect(lab.cleanup().status).toBe('passed');}
  expect(spawnSync('docker',['inspect',name],{stdio:'ignore'}).status).not.toBe(0);
  expect(spawnSync('docker',['inspect',name+'-network'],{stdio:'ignore'}).status).not.toBe(0);
  expect(spawnSync('docker',['inspect',name+'-bind'],{stdio:'ignore'}).status).not.toBe(0);
  expect(spawnSync('docker',['network','inspect',name],{stdio:'ignore'}).status).not.toBe(0);
  for(const volume of mounts)expect(spawnSync('docker',['volume','inspect',volume],{stdio:'ignore'}).status).not.toBe(0);
  expect(docker(['volume','inspect',other,'--format','{{.Name}}'])).toBe(other);
 }finally{lab.cleanup();control.cleanup();rmSync(directory,{recursive:true,force:true});rmSync(controlDirectory,{recursive:true,force:true});}
});

it('handled termination runs scoped cleanup and retains its result before exiting nonzero',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-lab-exit-'));
 try{
  const module=new URL('../scripts/images/acceptance-lab.mjs',import.meta.url).href;
  const source=`import {createAcceptanceLab} from ${JSON.stringify(module)};createAcceptanceLab({directory:${JSON.stringify(directory)},run:()=>({status:0,stdout:''}),capture:()=>{}});process.kill(process.pid,'SIGTERM');setTimeout(()=>{},1000);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',source],{encoding:'utf8',timeout:5000});
  expect(result.status).toBe(143);expect(JSON.parse(readFileSync(join(directory,'lab-cleanup.json'),'utf8')).status).toBe('passed');
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('a retention filesystem failure cannot prevent removal of owned resources',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-lab-disk-')),calls=[],previous=process.exitCode;
 const run=(_binary,args)=>{calls.push(args);return {status:0,stdout:args[0]==='ps'&&args.includes('--filter')?'owned-container':''};};
 const lab=createAcceptanceLab({directory,run,capture:()=>{}});
 try{
  renameSync(directory,directory+'-retained');writeFileSync(directory,'not a directory');
  const result=lab.cleanup();expect(result.status).toBe('failed');expect(result.removed.containers).toBe(1);
  expect(result.failures.some(f=>f.operation==='retain cleanup result')).toBe(true);expect(calls.some(args=>args[0]==='rm'&&args.includes('--volumes'))).toBe(true);
 }finally{process.exitCode=previous;lab.cleanup();rmSync(directory,{force:true});rmSync(directory+'-retained',{recursive:true,force:true});}
});

it('explicit retention transfers the same ownership identity to a later selection without pruning',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-retain-')),calls=[];const run=(_command,args)=>{calls.push(args);return {status:0,stdout:''};};
 const lab=createAcceptanceLab({directory,id:'retained-fixture',run,capture:()=>{}});try{expect(lab.retain().status).toBe('retained');expect(calls).toHaveLength(0);const resumed=createAcceptanceLab({directory,id:lab.id,run,capture:()=>{}});expect(resumed.id).toBe(lab.id);expect(resumed.cleanup().status).toBe('passed');expect(calls.some(args=>args.includes('label=io.opintel.acceptance-run=retained-fixture'))).toBe(true);}finally{rmSync(directory,{recursive:true,force:true});}
});

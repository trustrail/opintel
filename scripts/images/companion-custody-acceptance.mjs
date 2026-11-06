import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,copyFileSync,chmodSync} from 'node:fs';
import {join,resolve} from 'node:path';
import process from 'node:process';
import assert from 'node:assert/strict';

export function prepareCompanionImage({directory,revision,platform='linux/amd64',run=spawnSync}){
 const execute=(binary,args)=>{const result=run(binary,args,{encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});if(result.error||result.status!==0)writeFileSync(join(directory,'companion-build.private.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});assert.ok(!result.error&&result.status===0,'Companion image preparation failed');return result.stdout??'';};
 const sourceRevision=execute('git',['rev-parse','HEAD']).trim()||revision;assert.match(sourceRevision,/^[a-f0-9]{7,40}$/u);
 const image='opintel-companion-acceptance:'+sourceRevision.slice(0,12);
 execute('docker',['buildx','build','--platform',platform,'--file','deploy/companion/Dockerfile','--tag',image,'--load','.']);return {image,sourceRevision};
}

/** Uses the kit exporter and the official-SDK live checker; no alternate client. */
export function companionCustodyAcceptance({directory,agent,key,apiKeyFile,base,project,sql,aggregateSql,revision,platform='linux/amd64',commandEnv=process.env,preparedImage,run=spawnSync}){
 function command(binary,args,env=process.env){const result=run(binary,args,{env,encoding:'utf8',timeout:600000,maxBuffer:16*1024*1024});if(result.error||result.status!==0)writeFileSync(join(directory,'companion-command.private.log'),(result.stdout??'')+(result.stderr??''),{mode:0o600});assert.ok(!result.error&&result.status===0,'Companion acceptance command failed: '+binary);return result.stdout??'';}
 const {image,sourceRevision}=preparedImage??prepareCompanionImage({directory,revision,platform,run});const name='opintel-companion-acceptance-'+Date.now();
 const trust=join(directory,'companion-ca.pem');copyFileSync(join(agent,'gateway-ca.pem'),trust);chmodSync(trust,0o644);
 const credential=join(directory,'companion-credential.json'),environment=join(directory,'companion.env'),cases=join(directory,'companion-cases.json'),report=join(directory,'companion-result.json');
 command(join(agent,'identities'),['export-companion','--identity','device-223','--key-file',key,'--api-key-file',apiKeyFile,'--out',credential],commandEnv);
 writeFileSync(environment,'OPINTEL_AGENT_CREDENTIAL='+readFileSync(credential,'utf8').trim()+'\n',{mode:0o600});
 writeFileSync(cases,JSON.stringify([{name:'rows',sql,column:'custody_label',rows:6},{name:'aggregate',lookup:'both',sql:aggregateSql,column:'total',rows:1}]),{mode:0o600});

 let started=false;
 try{
  command('docker',['run','--detach','--name',name,'--platform',platform,'--env-file',environment,'--env','MCP_PORT=8080','--env','AP_SIDECAR_CONFIG='+JSON.stringify({gateway:base,project,agentId:'custody-terminal-agent',caFile:null}),'--env','NODE_EXTRA_CA_CERTS=/trust/ca.pem','--mount','type=bind,src='+trust+',dst=/trust/ca.pem,readonly','--publish','127.0.0.1::8080',image]);started=true;
  const port=/127\.0\.0\.1:(\d+)/u.exec(command('docker',['port',name,'8080/tcp']))?.[1];assert.ok(port,'Companion acceptance port missing');
  const output=run(process.execPath,[resolve('scripts/companion/live-check.mjs'),'http://127.0.0.1:'+port,cases,report],{encoding:'utf8',timeout:180000});
  writeFileSync(join(directory,'companion-terminal-redacted.txt'),(output.stdout??'')+(output.stderr??''),{mode:0o600});
  assert.ok(!output.error&&output.status===0,'Companion rows/aggregate/replay acceptance failed; inspect sanitized companion log');
  const result=JSON.parse(readFileSync(report,'utf8'));assert.equal(result.status,'passed');assert.equal(result.checks.length,6);return {...result,sourceRevision};
 }finally{
  if(started){const logs=run('docker',['logs',name],{encoding:'utf8',timeout:30000});writeFileSync(join(directory,'companion-container.log'),(logs.stdout??'')+(logs.stderr??''),{mode:0o600});run('docker',['rm','--force',name],{encoding:'utf8',timeout:30000});}
 }
}

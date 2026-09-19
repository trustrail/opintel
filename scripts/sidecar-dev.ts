import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, chmod, mkdir, open, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { loadSidecarClientOptions } from '../src/modules/sources/index.js';
import { healthResponse } from '../src/shared/sidecar-contract.js';
import { loadSidecarConfig } from '../sidecar/config.js';

const exec = promisify(execFile);
export const sidecarDevDirectory = fileURLToPath(new URL('../tmp/sidecar/',import.meta.url));

/** Local development certificates only. Never overwrite an existing identity. */
export async function prepareSidecarDevelopment(directory=sidecarDevDirectory): Promise<void> {
  const tlsDir=resolve(directory,'tls');
  await mkdir(tlsDir,{recursive:true,mode:0o700});
  const complete=await access(resolve(tlsDir,'client.pem')).then(()=>true,()=>false);
  if (!complete) {
    const openssl=async(...args:string[])=>{try{await exec('openssl',args,{cwd:tlsDir});}catch{throw new Error('Local sidecar certificate generation failed. Install OpenSSL; inspect tmp/sidecar/tls for an incomplete setup.');}};
    // Refuse to overwrite keys after an interrupted setup.
    if(await access(resolve(tlsDir,'ca.key')).then(()=>true,()=>false))throw new Error('Incomplete sidecar TLS setup. Move tmp/sidecar/tls aside and rerun dev:up.');
    await openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-subj','/CN=Opintel local development CA','-days','30');
    for(const name of ['server','client']){
      await openssl('req','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj',`/CN=Opintel local ${name}`);
      await writeFile(resolve(tlsDir,`${name}.ext`),`subjectAltName=DNS:localhost,IP:127.0.0.1\nextendedKeyUsage=serverAuth,clientAuth\n`,{mode:0o600});
      await openssl('x509','-req','-in',`${name}.csr`,'-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',`${name}.pem`,'-days','30','-extfile',`${name}.ext`);
      await chmod(resolve(tlsDir,`${name}.key`),0o600);
    }
    await chmod(resolve(tlsDir,'ca.key'),0o600);
  }
  const service={host:'127.0.0.1',port:3100,tls:{caFile:'tls/ca.pem',certFile:'tls/server.pem',keyFile:'tls/server.key',clientPinFile:'tls/client.pem'},auditFile:'sampling-audit.jsonl',limits:{maxConnectionsPerSource:4,statementTimeoutMs:8000,operationTimeoutMs:9000}};
  const client={baseUrl:'https://127.0.0.1:3100',caFile:'tls/ca.pem',certFile:'tls/client.pem',keyFile:'tls/client.key',serverPinFile:'tls/server.pem',timeoutMs:9000};
  for(const [name,value]of [['service.json',service],['client.json',client]] as const){
    try{await writeFile(resolve(directory,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});}
    catch(error:unknown){if(!(typeof error==='object'&&error!==null&&'code'in error&&error.code==='EEXIST'))throw error;}
  }
  await loadSidecarConfig(resolve(directory,'service.json'));
}

export async function checkLocalSidecar(file=resolve(sidecarDevDirectory,'client.json')): Promise<void> {
  const options=await loadSidecarClientOptions(file);
  const fingerprint=new X509Certificate(options.tls.pinnedCertificate).fingerprint256;
  await new Promise<void>((resolve,reject)=>{
    const req=request(new URL('/health',options.baseUrl),{method:'POST',agent:false,...options.tls,minVersion:'TLSv1.3',rejectUnauthorized:true,signal:AbortSignal.timeout(1500),
      checkServerIdentity:(host,cert)=>checkServerIdentity(host,cert)??(cert.fingerprint256===fingerprint?undefined:new Error('Sidecar pin mismatch.'))},(res)=>{
      let body='';
      res.on('error',reject);
      res.on('data',(chunk:Buffer)=>{body+=chunk.toString('utf8');if(body.length>8192)res.destroy(new Error('Invalid health response.'));});
      res.on('end',()=>{try{const health=healthResponse.parse(JSON.parse(body) as unknown);if(res.statusCode!==200||health.contract!==1)throw new Error('Contract mismatch');resolve();}catch{reject(new Error('Local sidecar has an invalid health response or contract mismatch.'));}});
    });
    req.on('error',reject);req.end();
  });
}

export async function startDevelopmentSidecar(): Promise<void> {
  await prepareSidecarDevelopment();
  try{await checkLocalSidecar();console.info('Local sidecar is already ready.');return;}catch{/* Start below; a port conflict fails without stopping another process. */}
  const output=await open(resolve(sidecarDevDirectory,'service.log'),'a',0o600);
  const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('../sidecar/start.ts',import.meta.url)),resolve(sidecarDevDirectory,'service.json')],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),detached:true,stdio:['ignore',output.fd,output.fd],env:process.env,
  });
  let failed=false;
  child.on('error',()=>{failed=true;});child.on('exit',()=>{failed=true;});
  await output.close();
  try{
    for(let attempt=0;attempt<40;attempt++){
      if(failed)throw new Error('Sidecar process exited. Check tmp/sidecar/service.log; another process may own its port.');
      try{await checkLocalSidecar();if(failed)throw new Error('Sidecar exited');
        if(child.pid!==undefined)await writeFile(resolve(sidecarDevDirectory,'sidecar.pid'),String(child.pid)+'\n',{mode:0o600});
        child.unref();console.info('Local sidecar ready. Client configuration: tmp/sidecar/client.json.');return;
      }catch{await delay(250);}
    }
    throw new Error('Local sidecar did not become healthy. Check tmp/sidecar/service.log.');
  }catch(error:unknown){child.kill('SIGTERM');throw error;}
}

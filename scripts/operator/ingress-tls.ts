import {mkdir,chmod,access,rename,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {X509Certificate,createPrivateKey} from 'node:crypto';
async function main(){
 const cert=process.env.INGRESS_CERT_FILE,key=process.env.INGRESS_KEY_FILE;
 if(Boolean(cert)!==Boolean(key))throw new Error('Supply both ingress certificate and key paths, or neither.');
 if(cert&&key)return;
 const directory='/config/ingress-tls';await mkdir(directory,{recursive:true,mode:0o700});
 const exists=async(name:string)=>access(join(directory,name)).then(()=>true,()=>false);
 if(await exists('server.pem')||await exists('server.key')){
  const certificate=new X509Certificate(await readFile(join(directory,'server.pem'))),privateKey=createPrivateKey(await readFile(join(directory,'server.key')));
  if(!certificate.checkPrivateKey(privateKey))throw new Error('Existing fallback TLS identity is inconsistent.');return;
 }
 const hosts=(process.env.INGRESS_HOSTS??'localhost,127.0.0.1').split(',');
 if(hosts.some(host=>!/^([a-zA-Z0-9][a-zA-Z0-9.-]*|[0-9a-fA-F:]+)$/u.test(host)))throw new Error('Invalid ingress host names.');
 const sans=hosts.map(host=>(/^[0-9.]+$/u.test(host)||host.includes(':')?'IP:':'DNS:')+host).join(',');
 const run=(args:string[])=>{const r=spawnSync('openssl',args,{cwd:directory,stdio:'ignore'});if(r.status!==0)throw new Error('Fallback TLS generation failed.');};
 if(await exists('ca.pem')!==await exists('ca.key'))throw new Error('Incomplete fallback CA requires explicit operator recovery.');
 if(!await exists('ca.pem'))run(['req','-x509','-newkey','rsa:3072','-nodes','-keyout','ca.key','-out','ca.pem','-days','365','-subj','/CN=Opintel local fallback CA','-addext','basicConstraints=critical,CA:TRUE']);
 run(['req','-newkey','rsa:2048','-nodes','-keyout','server.key.pending','-out','server.csr','-subj','/CN=Opintel gateway','-addext','subjectAltName='+sans]);
 run(['x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem.pending','-days','90','-copy_extensions','copy']);
 for(const name of ['ca.key','server.key.pending'])await chmod(join(directory,name),0o600);
 for(const name of ['ca.pem','server.pem.pending'])await chmod(join(directory,name),0o644);
 await rename(join(directory,'server.key.pending'),join(directory,'server.key'));await rename(join(directory,'server.pem.pending'),join(directory,'server.pem'));
}
void main().catch(()=>{process.stderr.write('Ingress TLS setup failed. Check paired certificate paths or the existing fallback identity.\n');process.exitCode=1;});

import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {setTimeout} from 'node:timers';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {X509Certificate,randomUUID} from 'node:crypto';
import https from 'node:https';
import process from 'node:process';
import console from 'node:console';
// Agent-side prerequisite proof. Device private material is never mounted into nginx.
process.umask(0o077);
const identity=process.argv[2];
if(!identity)throw new Error('Usage: node scripts/images/agent-ingress-handshake.mjs AGENT_IDENTITY_DIRECTORY');
const directory=resolve(mkdtempSync('tmp/agent-ingress-handshake-')),name='opintel-agent-handshake-'+randomUUID();
const image=JSON.parse(readFileSync('deploy/images/upstream.json','utf8')).services.ingress.image;
const pem=file=>{const value=readFileSync(join(identity,file),'utf8');return value.includes('-----BEGIN')?value:Buffer.from(value.trim(),'base64').toString('utf8');};
const certificate=pem('client.crt'),key=pem('client.key'),fingerprint=new X509Certificate(certificate).fingerprint256;
function command(bin,args){const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000});if(r.status!==0||r.error)throw new Error(`${bin} failed (${r.status??r.error?.code}); prerequisite proof stopped`);return r.stdout.trim();}
const result={status:'running',image,checks:[]};
let started=false;
try{
 command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,'server.key'),'-out',join(directory,'server.pem'),'-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1','-addext','extendedKeyUsage=serverAuth']);
 let config=readFileSync('deploy/gateway/ingress/nginx.conf','utf8');
 config=config.replace('ssl_protocols TLSv1.2 TLSv1.3;','ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_verify_client optional_no_ca;\n    proxy_set_header X-Opintel-Client-Certificate $ssl_client_escaped_cert;');
 config=config.replace('set $api http://api:3000;','set $api http://127.0.0.1:8081;');
 config=config.replace('http {',`http {\n  server { listen 127.0.0.1:8081; location / { default_type text/plain; return 200 "$http_x_opintel_client_certificate"; } }`);
 writeFileSync(join(directory,'nginx.conf'),config);
 command('docker',['run','--detach','--name',name,'--publish','127.0.0.1::8443','--volume',join(directory,'nginx.conf')+':/etc/nginx/nginx.conf:ro','--volume',join(directory,'server.pem')+':/tls/console.pem:ro','--volume',join(directory,'server.key')+':/tls/console.key:ro',image]);started=true;
 const address=command('docker',['port',name,'8443/tcp']),port=Number(address.split(':').at(-1));
 const request=(version,withIdentity,spoof=false)=>new Promise((resolveRequest,reject)=>{
  const req=https.get({hostname:'127.0.0.1',port,path:'/mcp/probe',ca:readFileSync(join(directory,'server.pem')),agent:false,minVersion:version,maxVersion:version,...(withIdentity?{cert:certificate,key}:{}),headers:spoof?{'X-Opintel-Client-Certificate':'forged-certificate'}:{}},res=>{let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolveRequest({status:res.statusCode,body}));});
  req.setTimeout(5000,()=>req.destroy(new Error('Handshake request timed out')));req.on('error',reject);
 });
 // Wait only for startup; any TLS or HTTP failure ends the proof immediately.
 for(let attempt=0;;attempt++){try{const r=await request('TLSv1.2',false);assert.equal(r.status,200);break;}catch(error){if(error.code!=='ECONNREFUSED'||attempt===19)throw error;await new Promise(r=>setTimeout(r,250));}}
 for(const version of ['TLSv1.2','TLSv1.3']){
  const r=await request(version,true);assert.equal(r.status,200,'Client certificate rejected');assert.equal(new X509Certificate(decodeURIComponent(r.body)).fingerprint256,fingerprint);
  result.checks.push({name:version+' actual XQ certificate handshake and forwarded fingerprint',status:'passed'});
 }
 const anonymous=await request('TLSv1.3',false,true);assert.equal(anonymous.status,200);assert.equal(anonymous.body,'');
 result.checks.push({name:'Certificate-less request allowed; caller certificate header overwritten',status:'passed'});
 result.status='passed';
}catch(error){result.status='failed';result.error={name:error.name,code:error.code??null,message:error.message};process.exitCode=1;}
finally{if(started)spawnSync('docker',['rm','--force',name],{stdio:'ignore',timeout:30000});writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,result:join(directory,'result.json')}));}

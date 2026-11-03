import assert from 'node:assert/strict';
import {Buffer} from 'node:buffer';
import {setTimeout} from 'node:timers/promises';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {X509Certificate,createPrivateKey,randomUUID} from 'node:crypto';
import https from 'node:https';
import process from 'node:process';
import console from 'node:console';
// Agent-side prerequisite proof. Device private material is never mounted into nginx.
process.umask(0o077);
const identity=process.argv[2];
if(!identity)throw new Error('Usage: node scripts/images/agent-ingress-handshake.mjs AGENT_IDENTITY_DIRECTORY');
const directory=resolve(mkdtempSync('tmp/agent-ingress-handshake-')),name='opintel-agent-handshake-'+randomUUID();
const image=JSON.parse(readFileSync('deploy/images/upstream.json','utf8')).services.ingress.image;
const privateKey=()=>{const text=readFileSync(join(identity,'client.key'),'utf8');const bytes=text.includes('-----BEGIN')?Buffer.from(text):Buffer.from(text.trim(),'base64');try{return createPrivateKey(bytes.includes(Buffer.from('-----BEGIN'))?bytes:{key:bytes,format:'der',type:'pkcs8'}).export({format:'pem',type:'pkcs8'});}finally{bytes.fill(0);}};
const pem=file=>{const value=readFileSync(join(identity,file),'utf8');return value.includes('-----BEGIN')?value:Buffer.from(value.trim(),'base64').toString('utf8');};
function command(bin,args,label){const r=spawnSync(bin,args,{encoding:'utf8',timeout:30000});if(label)writeFileSync(join(directory,label+'.log'),(r.stdout??'')+(r.stderr??''));if(r.status!==0||r.error)throw new Error(`${bin} failed (${r.status??r.error?.code}); prerequisite proof stopped`);return r.stdout.trim();}
const result={status:'running',image,phase:'prepare',checks:[]};
let started=false;
const logs=()=>{const r=spawnSync('docker',['logs','--timestamps',name],{encoding:'utf8',timeout:30000});return (r.stdout??'')+(r.stderr??'');};
try{
 for(const [kind,usage] of [['server','serverAuth'],['test-client','clientAuth']])command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(directory,kind+'.key'),'-out',join(directory,kind+'.pem'),'-days','1','-subj','/CN='+kind,'-addext','subjectAltName=IP:127.0.0.1','-addext','extendedKeyUsage='+usage],kind+'-generation');
 let config=readFileSync('deploy/gateway/ingress/nginx.conf','utf8');
 config=config.replace('error_log /dev/stderr crit;','error_log /dev/stderr info;');
 config=config.replace('access_log off;',`log_format probe escape=json '{"connection":"$connection","case":"$arg_case","status":$status,"tls":"$ssl_protocol","verify":"$ssl_client_verify"}';\n  access_log /dev/stdout probe;`);
 config=config.replace('ssl_protocols TLSv1.2 TLSv1.3;','ssl_protocols TLSv1.2 TLSv1.3;\n    ssl_verify_client optional_no_ca;\n    proxy_set_header X-Opintel-Client-Certificate $ssl_client_escaped_cert;\n    add_header X-Probe-Verify $ssl_client_verify always;\n    add_header X-Probe-Connection $connection always;');
 config=config.replace('set $api http://api:3000;','set $api http://127.0.0.1:8081;');
 config=config.replace('http {',`http {\n  server { listen 127.0.0.1:8081; access_log off; location / { default_type text/plain; return 200 "$http_x_opintel_client_certificate"; } }`);
 writeFileSync(join(directory,'nginx.conf'),config);
 result.phase='start-nginx';
 command('docker',['run','--detach','--name',name,'--publish','127.0.0.1::8443','--volume',join(directory,'nginx.conf')+':/etc/nginx/nginx.conf:ro','--volume',join(directory,'server.pem')+':/tls/console.pem:ro','--volume',join(directory,'server.key')+':/tls/console.key:ro',image],'container-start');started=true;
 result.phase='nginx-readiness';
 // Establish readiness inside the container over plain HTTP, not by retrying a TLS case.
 const deadline=Date.now()+30000;let ready=false;
 while(Date.now()<deadline){const r=spawnSync('docker',['exec',name,'wget','-q','-O','/dev/null','http://127.0.0.1:8081/ready'],{encoding:'utf8',timeout:5000});if(r.status===0){ready=true;break;}await setTimeout(250);}
 assert.ok(ready,'nginx internal HTTP readiness failed');
 command('docker',['exec',name,'nginx','-t'],'nginx-config-test');
 const address=command('docker',['port',name,'8443/tcp'],'published-port').split('\n').find(line=>line.startsWith('127.0.0.1:'));
 assert.ok(address,'No IPv4 host port mapping');const port=Number(address.split(':').at(-1));assert.ok(Number.isInteger(port)&&port>0);
 writeFileSync(join(directory,'nginx-startup.log'),logs());
 const cases=[{id:'a',name:'no client certificate'},{id:'b',name:'fresh self-signed client certificate',cert:readFileSync(join(directory,'test-client.pem')),key:readFileSync(join(directory,'test-client.key'))},{id:'c',name:'XQ client certificate',cert:pem('client.crt'),key:privateKey()}];
 for(const item of cases){
  result.phase='case-'+item.id;const before=logs(),trace={id:item.id,name:item.name,startedAt:new Date().toISOString(),events:[],handshakeCompleted:false,tlsVersion:null,sslClientVerify:null,status:'running'};
  const record=(phase,detail={})=>trace.events.push({phase,at:new Date().toISOString(),...detail});let phase='request-creation';
  try{await new Promise(done=>{
   const req=https.get({hostname:'127.0.0.1',port,path:'/mcp/probe?case='+item.id,ca:readFileSync(join(directory,'server.pem')),agent:false,...(item.cert?{cert:item.cert,key:item.key}:{}),headers:{'X-Opintel-Client-Certificate':'caller-header-must-be-overwritten'}},res=>{
    phase='http-response';record(phase,{status:res.statusCode});trace.httpStatus=res.statusCode;trace.sslClientVerify=res.headers['x-probe-verify']??null;trace.nginxConnection=res.headers['x-probe-connection']??null;
    let body='';res.setEncoding('utf8');res.on('data',chunk=>{body+=chunk;});res.on('end',()=>{try{assert.equal(res.statusCode,200);if(item.cert)assert.equal(new X509Certificate(decodeURIComponent(body)).fingerprint256,new X509Certificate(item.cert).fingerprint256);else assert.equal(body,'');trace.forwardedCertificateMatches=true;trace.status='passed';}catch(error){trace.status='failed';trace.error={phase,name:error.name,code:error.code??null,message:error.message};}done();});
   });
   req.on('socket',socket=>{phase='connect';record(phase);socket.on('connect',()=>{phase='tls';record('tcp-connected');});socket.on('secureConnect',()=>{phase='http';trace.handshakeCompleted=true;trace.tlsVersion=socket.getProtocol();record('tls-complete',{protocol:trace.tlsVersion});});});
   req.setTimeout(10000,()=>req.destroy(new Error('Probe request timed out')));
   req.on('error',error=>{trace.status='failed';trace.error={phase,name:error.name,code:error.code??null,message:error.message};record('failure',trace.error);done();});
  });}catch(error){trace.status='failed';trace.error={phase,name:error.name,code:error.code??null,message:error.message};record('failure',trace.error);}
  await setTimeout(100);const after=logs(),beforeLines=new Set(before.split('\n')),connectionLines=after.split('\n').filter(line=>line&&!beforeLines.has(line));
  writeFileSync(join(directory,`case-${item.id}-nginx.log`),connectionLines.join('\n')+'\n');writeFileSync(join(directory,`case-${item.id}-client.json`),JSON.stringify(trace,null,2)+'\n');result.checks.push(trace);
 }
 result.status=result.checks.every(check=>check.status==='passed')?'passed':'failed';result.phase='completed';if(result.status!=='passed')process.exitCode=1;
}catch(error){result.status='failed';result.error={phase:result.phase,name:error.name,code:error.code??null,message:error.message};process.exitCode=1;}
finally{if(started){writeFileSync(join(directory,'nginx-full.log'),logs());spawnSync('docker',['rm','--force',name],{stdio:'ignore',timeout:30000});}writeFileSync(join(directory,'result.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,result:join(directory,'result.json')}));}

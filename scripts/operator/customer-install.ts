import {issuePairingCode,servePairing,claimEngine} from './engine-pairing.js';
import {importIdentity} from './identity-import.js';
import {operatorDiagnostic} from './diagnostics.js';
import {readFileSync,writeFileSync,mkdirSync,existsSync,readdirSync,chmodSync,appendFileSync,openSync,readSync,closeSync,lstatSync,renameSync,copyFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,X509Certificate,createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {parse} from 'dotenv';
import {z} from 'zod';
import {smtpSettings} from '../../src/platform/mail/infrastructure/smtp-adapter.js';
class InstallError extends Error {}
process.umask(0o077);
const root=process.env.OPINTEL_INSTALL_ROOT??'/package',state=join(root,'state');
const host=z.string().startsWith('/').parse(process.env.PACKAGE_HOST_DIRECTORY);
const kind=z.enum(['gateway','engine']).parse(process.argv[3]);
const serviceSchema=z.object({image:z.string().optional(),extends:z.object({file:z.string(),service:z.string()}).optional(),environment:z.record(z.string(),z.string()).optional(),volumes:z.array(z.string()).optional(),ports:z.array(z.string()).optional(),profiles:z.array(z.string()).optional(),network_mode:z.string().optional()}).passthrough();
type Service=z.infer<typeof serviceSchema>;
const json=(file:string):unknown=>JSON.parse(readFileSync(file,'utf8')) as unknown;
const write=(file:string,value:string|object,mode=0o600)=>{writeFileSync(join(root,file),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{mode,flag:'wx'});chmodSync(join(root,file),mode);};
function env(file:string,values:Record<string,string>){write(file,Object.entries(values).map(([k,v])=>{if(/[\r\n\0]/u.test(v))throw new InstallError('Environment values must be single line.');return `${k}='${v.replaceAll("'","\\'")}'`;}).join('\n')+'\n');}
const secret=()=>randomBytes(32).toString('hex');
function openssl(args:string[]){const r=spawnSync('openssl',args,{cwd:state,stdio:'ignore'});if(r.status!==0)throw new InstallError('Certificate generation failed.');}
function certificate(name:string,sans:string){
 openssl(['req','-newkey','rsa:2048','-nodes','-keyout',name+'.key','-out',name+'.csr','-subj','/CN=Opintel '+name]);
 write('state/'+name+'.ext',`subjectAltName=${sans}\nextendedKeyUsage=serverAuth,clientAuth\n`);
 openssl(['x509','-req','-in',name+'.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out',name+'.pem','-days','365','-extfile',name+'.ext']);
 // The enclosing host state directory is private; mounted public configuration
 // is readable by the isolated runtime UID without making host state public.
 chmodSync(join(state,name+'.pem'),0o600);chmodSync(join(state,name+'.key'),0o600);
}
function pairingService(uid:number,gid:number,platform:string):Service{return {image:readFileSync(join(root,'bootstrap.image'),'utf8').trim(),platform,pull_policy:'never',user:`${uid}:${gid}`,read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],stdin_open:false,tty:false,environment:{PACKAGE_HOST_DIRECTORY:host},volumes:[host+':/package'],ports:['0.0.0.0:3103:3103'],command:['node','scripts/operator/customer-install.js','pairing-server','engine'],restart:'unless-stopped',healthcheck:{test:['CMD','node','-e',"require('node:https').get('https://127.0.0.1:3103/health',{rejectUnauthorized:false},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"],interval:'2s',timeout:'3s',retries:30}};}
function writePairedMetadata(){
 const directory=join(state,'paired-engines');mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
 if(!existsSync(join(state,'peer.json')))return;
 const peer=z.object({version:z.literal(1),kind:z.literal('engine'),address:z.url(),certificate:z.string(),ca:z.string(),pin:z.string()}).parse(json(existsSync(join(state,'output/peer.json'))?join(state,'output/peer.json'):join(state,'peer.json')));
 // This projection contains public trust metadata only, never readiness URLs,
 // source credentials, the CA private key or the installation custody master.
 writeFileSync(join(directory,'peer.json'),JSON.stringify(peer)+'\n',{mode:0o600});chmodSync(join(directory,'peer.json'),0o600);
}
function mountPairedMetadata(service:Service){
 writePairedMetadata();service.environment={...service.environment,INSTALLATION_PAIRING_FILE:'/installation-pairing/peer.json'};
 if(!service.volumes?.some(v=>v.endsWith(':/installation-pairing:ro')))service.volumes=[...service.volumes??[],host+'/state/paired-engines:/installation-pairing:ro'];
}
function prepareIdentityDirectory(){
 const directory=join(root,'identity-bundles'),legacy=join(root,'identities');
 if(existsSync(legacy)&&lstatSync(legacy).isSymbolicLink())throw new InstallError('Identity command or legacy directory must not be a link.');
 if(existsSync(legacy)&&lstatSync(legacy).isDirectory()){
  if(existsSync(directory))throw new InstallError('Identity directory conflict. Preserve both directories; no bundle was overwritten.');
  renameSync(legacy,directory);
  // Older upgrade wrappers skipped the old identities directory. Install the
  // new command from the identical dispatcher shipped as ./install.
  if(existsSync(join(root,'install'))){copyFileSync(join(root,'install'),legacy);chmodSync(legacy,0o755);}
 }
 if(existsSync(directory)&&(!lstatSync(directory).isDirectory()||lstatSync(directory).isSymbolicLink()))throw new InstallError('identity-bundles must be a private directory, not a file or link.');
 mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);
}
function initialize(){
 if(existsSync(join(state,'installed.json'))){console.info('Existing installation retained; secrets and decisions are unchanged.');return;}
 if(existsSync(state))throw new InstallError('Incomplete installation state exists. Preserve it and use ./restore; install will not overwrite secrets.');
 const packageText=existsSync(join(root,'package.env'))?readFileSync(join(root,'package.env'),'utf8'):'';
 const settings=parse(packageText);
 // SMTP passwords are literal single-line values, not dotenv expressions/comments.
 const passwordLine=packageText.split(/\r?\n/u).findLast(line=>/^\s*SMTP_PASSWORD\s*=/u.test(line));
 if(passwordLine!==undefined){
  let value=passwordLine.slice(passwordLine.indexOf('=')+1);
  if((value.startsWith("'")&&value.endsWith("'"))||(value.startsWith('"')&&value.endsWith('"')))value=value.slice(1,-1);
  if(/[\r\n\0]/u.test(value))throw new InstallError('SMTP password must be single line.');
  settings.SMTP_PASSWORD=value;
 }
 for(const name of Object.keys(settings))if(/(?:^OPINTEL_.*TEST_|^OPINTEL_SECRET_DEMO_)/u.test(name)||name==='OPINTEL_XQ_REDEEM_URL')throw new InstallError('Unsupported customer package setting: '+name+'. Use the shipped package.env template; defaults are generated internally.');
 const address=z.ipv4().parse(process.env.PACKAGE_HOST_ADDRESS);
 const platform=z.enum(['linux/amd64','linux/arm64']).parse(readFileSync(join(root,'platform'),'utf8').trim());
 const localImages=z.record(z.string(),z.string()).parse(json(join(root,'local-images.json')));
 let app:URL|undefined;
 if(kind==='gateway'){
  app=new URL(z.url().parse(settings.APP_BASE_URL));if(app.protocol!=='https:'||app.username||app.password||app.pathname!=='/')throw new InstallError('APP_BASE_URL must be an HTTPS origin.');
  z.email().parse(settings.OWNER_EMAIL);try{smtpSettings(settings);}catch(error){throw new InstallError(error instanceof Error?error.message:'Invalid SMTP configuration.');}
  for(const name of ['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID','SMTP_HOST','SMTP_PORT','SMTP_SENDER','SMTP_TLS_MODE'])if(!settings[name])throw new InstallError('Missing package setting: '+name);
  if(Boolean(settings.GATEWAY_INGRESS_CERT_FILE)!==Boolean(settings.GATEWAY_INGRESS_KEY_FILE))throw new InstallError('Supply both ingress certificate paths or neither.');
 }
 for(const name of ['PAL_PROVIDER','PAL_MODEL','EMBEDDING_MODEL'])if(settings[name]&&settings[name]!=='disabled')throw new InstallError('Hosted models are disabled in this on-premises package. No model egress is enabled.');
 const uid=process.getuid?.()??65534,gid=process.getgid?.()??65534;if(uid===0)throw new InstallError('Run the installer as a non-root operator.');
 if(kind==='gateway')prepareIdentityDirectory();
 mkdirSync(state,{mode:0o700});for(const name of ['xq','output','audit','custody','ingest','control']){mkdirSync(join(state,name),{mode:0o700});chmodSync(join(state,name),0o700);}
 write('state/control/hosts','',0o600);
 openssl(['req','-x509','-newkey','rsa:3072','-nodes','-keyout','ca.key','-out','ca.pem','-days','3650','-subj','/CN=Opintel installation '+randomBytes(16).toString('hex'),'-addext','basicConstraints=critical,CA:TRUE']);chmodSync(join(state,'ca.pem'),0o600);chmodSync(join(state,'ca.key'),0o600);
 const tlsHost=app?.hostname??address;
 const sans=`DNS:localhost,DNS:host.docker.internal,DNS:ingress,IP:127.0.0.1,IP:${address},${z.ipv4().safeParse(tlsHost).success?'IP':'DNS'}:${tlsHost}`;
 certificate(kind==='gateway'?'application':'engine',sans);write('state/peer-ca.pem',readFileSync(join(state,'ca.pem'),'utf8'));
 const installId='opintel-'+kind+'-'+randomBytes(5).toString('hex');
 const vars:Record<string,string>={PLATFORM:platform};
 const operator:Record<string,string>={};
 const runtime:Record<string,string>={PAL_PROVIDER:'disabled',PAL_MODEL:'disabled',EMBEDDING_MODEL:'disabled'};
 const services:Record<string,Service>={},volumes:Record<string,object>={};
 for(const file of readdirSync(join(root,'services'))){
  const config=z.object({services:z.record(z.string(),serviceSchema),volumes:z.record(z.string(),z.object({}).passthrough()).optional()}).parse(json(join(root,'services',file)));
  Object.assign(services,config.services);Object.assign(volumes,config.volumes);
 }
 const defaults=z.object({services:z.record(z.string(),z.object({image:z.string()}))}).parse(json(join(root,'upstream.json')));
 for(const [name,service] of Object.entries(services)){
  const ref=service.extends?defaults.services[service.extends.service]?.image:service.image;
  if(!ref||!localImages[ref])throw new InstallError('Offline image mapping missing: '+name);
  service.image=localImages[ref];delete service.extends;
  if(!['postgres','spicedb-postgres','egress'].includes(name))service.user=`${uid}:${gid}`;
  service.platform=platform;service.pull_policy='never';service.stdin_open=false;service.tty=false;
  if(service.restart==='no')service.profiles=['jobs'];
 }
 if(kind==='gateway'&&app){
  const database=secret(),redis=secret(),spice=secret(),runtimePassword=secret(),master=secret();
  certificate('spicedb','DNS:spicedb,DNS:localhost,IP:127.0.0.1');certificate('ingress',sans);
  write('state/application-tls.json',{caFile:'/config/peer-ca.pem',certFile:'/config/application.pem',keyFile:'/config/application.key'},0o600);
  write('state/postgres-password',database+'\n',0o600);write('state/redis.conf',`bind 0.0.0.0\nprotected-mode yes\nsave ""\nappendonly no\nrequirepass ${redis}\n`,0o600);
  write('state/runtime-role.sql',`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='opintel_gateway') THEN CREATE ROLE opintel_gateway LOGIN PASSWORD '${runtimePassword}'; END IF; END $$; GRANT opintel_app,opintel_platform,opintel_platform_admin TO opintel_gateway;\n`,0o600);
  Object.assign(runtime,Object.fromEntries(Object.entries(settings).filter(([k])=>['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'].includes(k)||k.startsWith('SMTP_'))),{APP_BASE_URL:app.origin,OPINTEL_API_BASE_URL:app.origin,OWNER_EMAIL:settings.OWNER_EMAIL!,DATABASE_URL:`postgresql://opintel_gateway:${runtimePassword}@postgres:5432/opintel`,REDIS_URL:`redis://:${redis}@redis:6379`,SPICEDB_ENDPOINT:'spicedb:50051',SPICEDB_TOKEN:spice,SESSION_SECRET:secret(),OPINTEL_CUSTODY_MASTER_KEY:master,OPINTEL_XQ_REDEEM_URL:'https://validation.xqmsg.net/v2/key',APPLICATION_TLS_CONFIG:'/config/application-tls.json'});
  operator.OPINTEL_OPERATOR_API_TARGET='https://ingress:8444';
  operator.MIGRATION_DATABASE_URL=`postgresql://opintel:${database}@postgres:5432/opintel`;
  env('state/spicedb.env',{SPICEDB_GRPC_PRESHARED_KEY:spice,SPICEDB_DATASTORE_CONN_URI:`postgres://spicedb:${database}@spicedb-postgres:5432/spicedb?sslmode=disable`,SPICEDB_GRPC_TLS_CERT_PATH:'/config/spicedb.pem',SPICEDB_GRPC_TLS_KEY_PATH:'/config/spicedb.key'});
  Object.assign(vars,{GATEWAY_CONFIG_DIRECTORY:host+'/state',GATEWAY_API_ENV_FILE:host+'/state/runtime.env',GATEWAY_OPERATOR_ENV_FILE:host+'/state/operator.env',GATEWAY_SPICEDB_ENV_FILE:host+'/state/spicedb.env',GATEWAY_POSTGRES_PASSWORD_FILE:host+'/state/postgres-password',GATEWAY_SPICEDB_POSTGRES_PASSWORD_FILE:host+'/state/postgres-password',GATEWAY_REDIS_CONFIG_FILE:host+'/state/redis.conf',GATEWAY_XQ_DIRECTORY:host+'/state/xq',GATEWAY_AGENT_CERTIFICATES_DIRECTORY:host+'/identity-bundles',GATEWAY_OPERATOR_OUTPUT_DIRECTORY:host+'/state/output',GATEWAY_OPERATOR_UID:String(process.getuid?.()??65534),GATEWAY_OPERATOR_GID:String(process.getgid?.()??65534),GATEWAY_HEARTBEAT_URL:`https://${app.hostname}:3102`,GATEWAY_HEARTBEAT_BIND_ADDRESS:'0.0.0.0',GATEWAY_RECEIPT_BIND_ADDRESS:'0.0.0.0',GATEWAY_INGRESS_CONFIG_FILE:host+'/ingress/nginx.conf',GATEWAY_INGRESS_CERT_FILE:settings.GATEWAY_INGRESS_CERT_FILE??host+'/state/ingress.pem',GATEWAY_INGRESS_KEY_FILE:settings.GATEWAY_INGRESS_KEY_FILE??host+'/state/ingress.key',GATEWAY_CONSOLE_BIND_ADDRESS:'0.0.0.0',GATEWAY_CONSOLE_PORT:app.port||'443',...Object.fromEntries(Object.entries(settings).filter(([k])=>k.startsWith('SMTP_')))});
  const internalIngress=`
  server {
    listen 8444 ssl;
    ssl_certificate /tls/operator.pem;
    ssl_certificate_key /tls/operator.key;
    ssl_protocols TLSv1.2 TLSv1.3;
    set $api http://api:3000;
    proxy_set_header Host $http_host;
    proxy_set_header X-Forwarded-Proto https;
    client_max_body_size 0;
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 90s;
    location = /healthz { proxy_pass $api; }
    location ~ ^/(api|mcp)(/|$) { proxy_pass $api; }
    location / { return 404; }
  }
}
`;
  write('state/nginx.conf',readFileSync(join(root,'ingress/nginx.conf'),'utf8').replace(/^user nginx;\n/u,'').replace(/\n\}\s*$/u,internalIngress),0o600);
  vars.GATEWAY_INGRESS_CONFIG_FILE=host+'/state/nginx.conf';
  services.ingress!.volumes!.push(host+'/state/application.pem:/tls/operator.pem:ro',host+'/state/application.key:/tls/operator.key:ro');
  services.console!.environment={CONSOLE_EXTERNAL_TLS:settings.GATEWAY_INGRESS_CERT_FILE?'supplied':''};
  for(const name of ['postgres','redis','spicedb-postgres','spicedb','api'])services[name]!.ports=[];
  services.api!.ports=['0.0.0.0:3102:3102','0.0.0.0:3101:3101'];
  for(const name of ['api','provision','demo-tools'])services[name]!.environment!.APPLICATION_TLS_CONFIG='/config/application-tls.json';
  for(const name of ['api','spicedb','ingress','redis'])services[name]!.user=`${uid}:${gid}`;
  mkdirSync(join(state,'mail'),{mode:0o700});services.api!.volumes=services.api!.volumes!.map(v=>v==='mail:/mail'?host+'/state/mail:/mail':v);delete volumes.mail;
  services.api!.environment!.NODE_EXTRA_CA_CERTS='/config/ca.pem';services.api!.environment!.APPLICATION_TLS_CONFIG='/config/application-tls.json';
  services.postgres!.volumes!.push(host+'/state/runtime-role.sql:/config/runtime-role.sql:ro');
  for(const service of Object.values(services))if(service.environment?.NODE_EXTRA_CA_CERTS)service.environment.NODE_EXTRA_CA_CERTS='/config/ca.pem';
  services.spicedb!.healthcheck={test:['CMD','/usr/local/bin/grpc_health_probe','-addr=localhost:50051','-tls','-tls-ca-cert=/config/ca.pem','-tls-server-name=spicedb'],interval:'10s',timeout:'5s',retries:6};
  services.operator={...services.provision!,command:['node','scripts/operator/customer-operator.js','--help'],profiles:['jobs']};
  write('state/custody-backup.key',master+'\n');
 }else{
  mkdirSync(join(state,'sources'),{mode:0o700});chmodSync(join(state,'sources'),0o700);
  const database=secret();runtime.OPINTEL_SECRET_INSTALL_READINESS=`postgresql://readiness:${database}@readiness:5432/readiness`;
  runtime.UV_THREADPOOL_SIZE='16';
  write('state/gateway-registration.json',{version:1,kind:'engine',address:`https://${address}:3100`,certificate:readFileSync(join(state,'engine.pem'),'utf8'),ca:readFileSync(join(state,'ca.pem'),'utf8'),pin:new X509Certificate(readFileSync(join(state,'engine.pem'))).fingerprint256,demoSourceUrl:`postgresql://readiness:${database}@${address}:5434/readiness`});
  write('state/application.pem',readFileSync(join(state,'engine.pem'),'utf8'),0o600);
  write('state/service.json',{host:'0.0.0.0',port:3100,tls:{caFile:'/config/peer-ca.pem',certFile:'/config/engine.pem',keyFile:'/config/engine.key',clientPinFile:'/config/application.pem'},auditFile:'/audit/sampling.jsonl',custody:{keyStore:'/custody/keys',keyEscrow:'/custody/escrow'},postgresExtension:'/work/tmp/duckdb-extensions/postgres_scanner.duckdb_extension',postgresReadinessSource:'secret://install/readiness',limits:{maxConnectionsPerSource:8,statementTimeoutMs:30000,operationTimeoutMs:35000}},0o600);
  Object.assign(vars,{ENGINE_CONFIG_DIRECTORY:host+'/state',ENGINE_STATE_DIRECTORY:host+'/state',ENGINE_ENV_FILE:host+'/state/runtime.env',ENGINE_AUDIT_DIRECTORY:host+'/state/audit',ENGINE_CUSTODY_DIRECTORY:host+'/state/custody',ENGINE_INGEST_DIRECTORY:host+'/state/ingest',ENGINE_XQ_DIRECTORY:host+'/state/xq',ENGINE_BIND_ADDRESS:'0.0.0.0',ENGINE_PORT:'3100'});
  services.engine!.environment={...services.engine!.environment,ENGINE_PAIRING_TRUST_RELOAD:'1'};
  for(const name of ['engine','egress','prepare']){services[name]!.environment={...services[name]!.environment,ENGINE_SOURCE_SECRETS_DIRECTORY:'/source-secrets'};services[name]!.volumes=[...services[name]!.volumes??[],host+'/state/sources:/source-secrets:ro'];}
  services.engine!.network_mode='service:egress';services.engine!.user=`${uid}:${gid}`;services.prepare!.user=`${uid}:${gid}`;services.egress!.cap_add=['NET_ADMIN','DAC_OVERRIDE','CHOWN'];services.egress!.environment={...services.egress!.environment,EGRESS_STATE_UID:String(uid),EGRESS_STATE_GID:String(gid)};
  services.readiness={image:localImages[defaults.services.postgres!.image],platform,pull_policy:'never',environment:{POSTGRES_USER:'readiness',POSTGRES_PASSWORD:database,POSTGRES_DB:'readiness'},volumes:['readiness-data:/var/lib/postgresql/data'],ports:['0.0.0.0:5434:5432'],restart:'unless-stopped',healthcheck:{test:['CMD','pg_isready','-U','readiness'],interval:'2s',timeout:'3s',retries:30}};
  volumes['readiness-data']={};
  services.pairing=pairingService(uid,gid,platform);

 }
 // Bind only the runtime files, preserving a mode-700 host state directory.
 for(const [name,service] of Object.entries(services)){
  if(!service.volumes)continue;
  const configFiles=kind==='engine'?['ca.pem','peer-ca.pem','engine.pem','engine.key','application.pem','service.json']:name.startsWith('spicedb')?['ca.pem','spicedb.pem','spicedb.key']:['api','operator','provision','demo-tools'].includes(name)?['ca.pem','peer-ca.pem','application.pem','application.key','application-tls.json']:['ca.pem'];
  service.volumes=service.volumes.flatMap(volume=>volume.endsWith(':/config:ro')?configFiles.map(file=>host+'/state/'+file+':/config/'+file+':ro'): [volume]);
 }
 if(kind==='gateway'){
  // Raw env_file bypasses Compose interpolation and quote/escape processing.
  write('state/smtp-password.env','SMTP_PASSWORD='+(settings.SMTP_PASSWORD??'')+'\n');
  delete runtime.SMTP_PASSWORD;delete vars.SMTP_PASSWORD;
  for(const name of ['api','operator','provision','demo-tools']){
   const service=services[name]!;delete service.environment!.SMTP_PASSWORD;
   const files=z.array(z.string()).parse(service.env_file);
   service.env_file=[...files,{path:host+'/state/smtp-password.env',format:'raw'}];
  }
 }
 env('state/runtime.env',runtime);env('state/operator.env',{...runtime,...operator,OPINTEL_DEPLOYMENT_PACKAGE:'gateway',OPINTEL_CUSTOMER_JOB:'1',OPINTEL_OPERATOR_CONFIG:'/output/operator.json',OPINTEL_PROVISION_MANIFEST:'/output/provision.json',OPINTEL_SOAK_MANIFEST:'/output/soak.json',OPINTEL_SEED_MANIFEST:'/output/seed.json',OPINTEL_CERTIFICATES:'/output/certificates.json',OPINTEL_OUTPUT_DIRECTORY:'/output',OPINTEL_DIAGNOSTIC_DISPLAY_DIRECTORY:host+'/state/output',OPINTEL_SOAK_OUTPUT_DIRECTORY:'/output/soak',OPINTEL_DEMO_FIXTURE:'V-01',OPINTEL_DEMO_SEED:'1',OPINTEL_DEMO_SCHEMAS:'soak_policies,soak_claims,soak_recoveries',OPINTEL_SOAK_DURATION:'1800',OPINTEL_SOAK_RATE:'10000'});env('state/package.env',vars);
 for(const name of Object.keys(volumes))volumes[name]={name:installId+'-'+name};
 write('state/project-name',installId+'\n');
 write('state/volumes.list',Object.keys(volumes).map(n=>installId+'-'+n).join('\n')+'\n');
 if(kind==='gateway')mountPairedMetadata(services.api!);
 write('state/compose.json',{name:installId,services,volumes});
 const pem=readFileSync(join(state,kind==='gateway'?'application.pem':'engine.pem'),'utf8');
 write('trust.json',{version:1,kind,address:kind==='gateway'?`https://${app!.hostname}:3102`:`https://${address}:3100`,certificate:pem,ca:readFileSync(join(state,'ca.pem'),'utf8'),pin:new X509Certificate(pem).fingerprint256},0o600);
 auditPermissions();
 write('state/installed.json',{configurationVersion:1,hostDirectory:host,kind,installId,platform,address,baseUrl:app?.origin,ownerEmail:settings.OWNER_EMAIL??null,settingsHash:createHash('sha256').update(JSON.stringify(settings)).digest('hex')});
}
function auditPermissions(){
 const walk=(directory:string)=>{for(const name of readdirSync(directory)){const file=join(directory,name),stat=lstatSync(file);if(stat.isSymbolicLink())throw new InstallError('Permission audit refuses symlink: '+file);if((stat.mode&0o077)!==0)throw new InstallError('Permission audit failed (must be private): '+file);if(stat.isDirectory())walk(file);}};
 if((lstatSync(state).mode&0o077)!==0)throw new InstallError('Permission audit failed: state directory must be mode 700.');walk(state);if(kind==='gateway'){const identities=join(root,'identity-bundles');if((lstatSync(identities).mode&0o077)!==0)throw new InstallError('Identity directory must be mode 700.');walk(identities);}
}
function status(){const value=z.object({kind:z.string(),installId:z.string(),baseUrl:z.string().optional()}).parse(json(join(state,'installed.json')));console.info('Install: '+value.installId);if(value.baseUrl)console.info('Console and owner sign-in: '+value.baseUrl+'/sign-in');console.info('Public identity: trust.json');const identity=z.object({pin:z.string(),address:z.string()}).parse(json(join(root,'trust.json')));console.info('Pinned service address: '+identity.address);console.info('Certificate pin: '+identity.pin);}
function pair(expectedPin=process.argv[4]){
 const peer=z.object({version:z.literal(1),kind:z.enum(['gateway','engine']),address:z.url(),certificate:z.string().max(32768),ca:z.string().max(32768),pin:z.string(),demoSourceUrl:z.string().optional()}).parse(json(join(state,'incoming.json')));
 if(peer.kind===kind)throw new InstallError('Supply the other package identity.');
 const certificate=new X509Certificate(peer.certificate),ca=new X509Certificate(peer.ca);
 if(certificate.fingerprint256!==expectedPin||peer.pin!==certificate.fingerprint256||!certificate.verify(ca.publicKey)||!ca.ca)throw new InstallError('Peer certificate or pin verification failed.');
 if(Date.parse(certificate.validTo)<=Date.now()||Date.parse(certificate.validFrom)>Date.now())throw new InstallError('Peer certificate is outside its validity period.');
 const endpoint=new URL(peer.address);if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password)throw new InstallError('Peer address must be HTTPS.');
 if(existsSync(join(state,'peer.json'))){const existing=z.object({pin:z.string(),address:z.string()}).parse(json(join(state,'peer.json')));if(existing.pin!==peer.pin||existing.address!==peer.address)throw new InstallError('Peer conflict; existing trust is unchanged.');console.info('Matching peer trust retained.');return;}
 const installed=z.object({address:z.string()}).parse(json(join(state,'installed.json')));
 const localPeer=kind==='gateway'&&endpoint.hostname===installed.address;
 if(kind==='gateway'){const source=new URL(z.string().parse(peer.demoSourceUrl));if(source.protocol!=='postgresql:'||source.hostname!==endpoint.hostname)throw new InstallError('Demo source identity differs from the paired engine.');}
 writeFileSync(join(state,'peer-ca.pem'),peer.ca,{mode:0o600});chmodSync(join(state,'peer-ca.pem'),0o600);
 appendFileSync(join(state,'ca.pem'),'\n'+peer.ca);
 if(kind==='engine'){
  writeFileSync(join(state,'application.pem'),peer.certificate,{mode:0o600});
  const config=z.record(z.string(),z.unknown()).parse(json(join(state,'service.json')));
  config.tls={caFile:'/config/peer-ca.pem',certFile:'/config/engine.pem',keyFile:'/config/engine.key',clientPinFile:'/config/application.pem'};
  writeFileSync(join(state,'service.json'),JSON.stringify(config,null,2)+'\n');
 }else{
  const url=new URL(z.string().parse(peer.demoSourceUrl));if(url.protocol!=='postgresql:'||url.hostname!==endpoint.hostname)throw new InstallError('Demo source identity differs from the paired engine.');
  if(localPeer){url.hostname='host.docker.internal';const vars=parse(readFileSync(join(state,'package.env'))),heartbeat=new URL(z.string().parse(vars.GATEWAY_HEARTBEAT_URL));heartbeat.hostname='host.docker.internal';writeFileSync(join(state,'package.env'),readFileSync(join(state,'package.env'),'utf8').replace("GATEWAY_HEARTBEAT_URL='"+vars.GATEWAY_HEARTBEAT_URL+"'","GATEWAY_HEARTBEAT_URL='"+heartbeat.href+"'"));}
  appendFileSync(join(state,'operator.env'),`OPINTEL_SECRET_INSTALL_READINESS='${url.href}'\nOPINTEL_DEMO_DATABASE_URL='${url.href}'\n`);
 }
 write('state/peer.json',peer);if(kind==='gateway'){write('state/output/peer.json',{...peer,address:localPeer?'https://host.docker.internal:'+endpoint.port:peer.address});writePairedMetadata();}console.info('Peer identity paired by certificate pin.');
}
function fileHash(file:string){const hash=createHash('sha256'),fd=openSync(file,'r'),buffer=Buffer.alloc(1024*1024);try{for(;;){const size=readSync(fd,buffer);if(!size)break;hash.update(buffer.subarray(0,size));}return hash.digest('hex');}finally{closeSync(fd);}}
function stateHashes(directory:string,prefix=''):Record<string,string>{
 const hashes:Record<string,string>={};
 for(const name of readdirSync(join(directory,prefix)).sort()){
  const relative=prefix?prefix+'/'+name:name,file=join(directory,relative),stat=lstatSync(file);
  if(stat.isSymbolicLink())throw new InstallError('Backup state must not contain symbolic links.');
  if(stat.isDirectory())Object.assign(hashes,stateHashes(directory,relative));
  else if(stat.isFile())hashes[relative]=fileHash(file);
  else throw new InstallError('Backup state contains an unsupported file.');
 }
 return hashes;
}
function backupRecord(){
 const destination=z.string().startsWith(host+'/backups/').parse(process.argv[4]),local=root+destination.slice(host.length);
 const volumes=readFileSync(join(state,'volumes.list'),'utf8').trim().split('\n');
 const hashes=Object.fromEntries(volumes.map(volume=>[volume,fileHash(join(local,volume+'.tar.gz'))]));
 writeFileSync(join(local,'backup.json'),JSON.stringify({version:1,kind,revision:z.object({revision:z.string()}).parse(json(join(root,'release.json'))).revision,volumes:hashes,state:stateHashes(join(local,'state')),trust:fileHash(join(local,'trust.json'))},null,2)+'\n',{mode:0o600,flag:'wx'});
}
function validateRestore(){
 const backup=z.object({version:z.literal(1),kind:z.enum(['gateway','engine']),revision:z.string(),state:z.record(z.string(),z.string()),trust:z.string(),volumes:z.record(z.string().regex(/^opintel-(?:gateway|engine)-[a-f0-9]{10}-[a-z-]+$/u),z.string().regex(/^[a-f0-9]{64}$/u))}).parse(json('/restore/backup.json'));
 if(backup.kind!==kind||backup.revision!==z.object({revision:z.string()}).parse(json(join(root,'release.json'))).revision)throw new InstallError('Restore requires the matching original package revision and kind.');
 if(JSON.stringify(stateHashes('/restore/state'))!==JSON.stringify(backup.state)||fileHash('/restore/trust.json')!==backup.trust)throw new InstallError('Backup state checksum mismatch.');
 const names=readFileSync('/restore/state/volumes.list','utf8').trim().split('\n');
 if(JSON.stringify(names.slice().sort())!==JSON.stringify(Object.keys(backup.volumes).sort()))throw new InstallError('Backup volume inventory mismatch.');
 for(const [volume,hash] of Object.entries(backup.volumes))if(fileHash('/restore/'+volume+'.tar.gz')!==hash)throw new InstallError('Backup data checksum mismatch.');
 console.info('Backup identity and data checksums verified.');
}
function rebase(){
 const saved=z.object({configurationVersion:z.literal(1),hostDirectory:z.string()}).passthrough().parse(json(join(state,'installed.json')));
 const replace=(value:unknown):unknown=>typeof value==='string'?value.replaceAll(saved.hostDirectory+'/',host+'/'):Array.isArray(value)?value.map(replace):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,replace(v)])):value;
 writeFileSync(join(state,'compose.json'),JSON.stringify(replace(json(join(state,'compose.json'))),null,2)+'\n');
 writeFileSync(join(state,'package.env'),readFileSync(join(state,'package.env'),'utf8').replaceAll(saved.hostDirectory+'/',host+'/'));
 writeFileSync(join(state,'installed.json'),JSON.stringify({...saved,hostDirectory:host},null,2)+'\n');
}
function hardenConfiguration(config:{services:Record<string,Service>}){
 const uid=process.getuid?.()??65534,gid=process.getgid?.()??65534;
 if(uid===0)throw new InstallError('Run the upgrade as the original non-root operator.');
 let peerCa=readFileSync(join(state,'ca.pem'),'utf8');
 const paired=existsSync(join(state,'peer.json'));
 if(paired){const peer=z.object({ca:z.string(),certificate:z.string(),pin:z.string()}).parse(json(join(state,'peer.json')));const certificate=new X509Certificate(peer.certificate),ca=new X509Certificate(peer.ca);if(!ca.ca||!certificate.verify(ca.publicKey)||certificate.fingerprint256!==peer.pin)throw new InstallError('Saved peer trust is invalid; upgrade retained all credentials.');peerCa=peer.ca;}
 writeFileSync(join(state,'peer-ca.pem'),peerCa,{mode:0o600});
 const tlsServices=kind==='gateway'?['api','operator','provision','demo-tools']:['engine','egress','prepare'];
 for(const [name,service] of Object.entries(config.services)){
  if(!['postgres','spicedb-postgres','readiness','egress'].includes(name))service.user=`${uid}:${gid}`;
  if(tlsServices.includes(name)&&!service.volumes?.some(v=>v.includes(':/config/peer-ca.pem:')))service.volumes=[...service.volumes??[],host+'/state/peer-ca.pem:/config/peer-ca.pem:ro'];
  if(kind==='gateway'&&tlsServices.includes(name))service.environment={...service.environment,APPLICATION_TLS_CONFIG:'/config/application-tls.json'};
 }
 if(kind==='gateway'){
  mountPairedMetadata(config.services.api!);
  prepareIdentityDirectory();
  const packageEnvironment=join(state,'package.env');
  writeFileSync(packageEnvironment,readFileSync(packageEnvironment,'utf8').replace(/^GATEWAY_AGENT_CERTIFICATES_DIRECTORY=.*$/mu,"GATEWAY_AGENT_CERTIFICATES_DIRECTORY='"+(host+'/identity-bundles').replaceAll("'","\\'")+"'"));
  writeFileSync(join(state,'application-tls.json'),JSON.stringify({caFile:'/config/peer-ca.pem',certFile:'/config/application.pem',keyFile:'/config/application.key'})+'\n');
  writeFileSync(join(state,'nginx.conf'),readFileSync(join(state,'nginx.conf'),'utf8').replace(/^user nginx;\n/u,''));
 }else{
  const service=z.record(z.string(),z.unknown()).parse(json(join(state,'service.json')));service.tls={caFile:'/config/peer-ca.pem',certFile:'/config/engine.pem',keyFile:'/config/engine.key',clientPinFile:'/config/application.pem'};
  mkdirSync(join(state,'sources'),{recursive:true,mode:0o700});
  for(const name of ['engine','egress','prepare']){const entry=config.services[name]!;entry.environment={...entry.environment,ENGINE_SOURCE_SECRETS_DIRECTORY:'/source-secrets'};if(!entry.volumes?.some(v=>v.includes(':/source-secrets:')))entry.volumes=[...entry.volumes??[],host+'/state/sources:/source-secrets:ro'];}
  writeFileSync(join(state,'service.json'),JSON.stringify(service,null,2)+'\n');
  config.services.pairing=pairingService(uid,gid,readFileSync(join(root,'platform'),'utf8').trim());
  config.services.engine!.environment={...config.services.engine!.environment,ENGINE_PAIRING_TRUST_RELOAD:'1'};
  config.services.egress!.cap_add=['NET_ADMIN','DAC_OVERRIDE','CHOWN'];config.services.egress!.environment={...config.services.egress!.environment,EGRESS_STATE_UID:String(uid),EGRESS_STATE_GID:String(gid)};
 }
 const protect=(file:string)=>{const stat=lstatSync(file);if(stat.isSymbolicLink())throw new InstallError('Upgrade refuses a symlink in private state: '+file);chmodSync(file,stat.isDirectory()?0o700:0o600);if(stat.isDirectory())for(const name of readdirSync(file))protect(join(file,name));};protect(state);auditPermissions();
}
function upgrade(){
 z.object({configurationVersion:z.literal(1)}).parse(json(join(state,'installed.json')));
 const config=z.object({services:z.record(z.string(),serviceSchema)}).passthrough().parse(json(join(state,'compose.json')));
 const images=z.record(z.string(),z.string()).parse(json(join(root,'local-images.json')));
 const upstream=z.object({services:z.record(z.string(),z.object({image:z.string()}))}).parse(json(join(root,'upstream.json')));
 for(const [name,service] of Object.entries(config.services)){
  let ref:string|undefined;
  if(name==='pairing'){const image=readFileSync(join(root,'bootstrap.image'),'utf8').trim();if(!Object.values(images).includes(image))throw new InstallError('Pairing image is absent from audited inventory.');service.image=image;continue;}
  if(name==='readiness')ref=upstream.services.postgres?.image;
  else{const file=name==='operator'?'provision':name;const definition=z.object({services:z.record(z.string(),serviceSchema)}).parse(json(join(root,'services',file+'.json'))).services[file];ref=definition?.extends?upstream.services[definition.extends.service]?.image:definition?.image;}
  if(!ref||!images[ref])throw new InstallError('Upgrade service inventory is incompatible. Restore the backup using its original package.');service.image=images[ref];
 }
 hardenConfiguration(config);writeFileSync(join(state,'compose.json'),JSON.stringify(config,null,2)+'\n');console.info('Audited image identities updated; configuration and credentials retained.');
}
try{
 if(process.argv[2]==='pairing-server'){
  if(kind!=='engine')throw new InstallError('Pairing listener requires an engine package.');
  const server=await servePairing(root);process.once('SIGTERM',()=>server.close(()=>process.exit(0)));
 }else if(process.argv[2]==='pairing-code'){
  if(kind!=='engine')throw new InstallError('Pairing codes are issued on the engine host.');
  console.info('Pairing code (expires in 15 minutes): '+issuePairingCode(root,true));
 }else if(process.argv[2]==='claim-engine'){
  if(kind!=='gateway')throw new InstallError('Register engines from the gateway host.');
  const peer=await claimEngine(root,z.string().parse(process.argv[4]),z.string().parse(process.argv[5]));
  writeFileSync(join(state,'incoming.json'),JSON.stringify(peer),{mode:0o600});pair(peer.pin);
 }else if(process.argv[2]==='identities')await importIdentity(root,'/import/export.zip',z.string().parse(process.argv[4]),process.argv[5]);
 else if(process.argv[2]==='initialize')initialize();
 else if(process.argv[2]==='installed'){
  auditPermissions();if(kind==='engine'&&!existsSync(join(state,'peer.json')))console.info('Pairing code (expires in 15 minutes): '+issuePairingCode(root));const identity=z.object({pin:z.string(),address:z.string()}).parse(json(join(root,'trust.json')));if(kind==='engine')console.info('Engine address: '+identity.address);const installed=z.object({baseUrl:z.string().optional()}).parse(json(join(state,'installed.json')));if(installed.baseUrl)console.info('Sign in: '+installed.baseUrl+'/sign-in');console.info('Certificate pin: '+identity.pin);if(kind==='gateway'&&!existsSync(join(state,'backup-instruction-shown'))){console.info('Back up this custody master key offline now. Losing it prevents redemption of existing grants.');console.info(readFileSync(join(state,'custody-backup.key'),'utf8').trim());write('state/backup-instruction-shown','shown\n');}
 }else if(process.argv[2]==='audit-permissions')auditPermissions();else if(process.argv[2]==='status')status();else if(process.argv[2]==='pair')pair();else if(process.argv[2]==='backup-record')backupRecord();else if(process.argv[2]==='validate-restore')validateRestore();else if(process.argv[2]==='rebase')rebase();else if(process.argv[2]==='upgrade')upgrade();else throw new InstallError('Unknown installer operation.');
}catch(error:unknown){operatorDiagnostic(error,join(root,'diagnostics'),join(host,'diagnostics'));process.exitCode=1;}

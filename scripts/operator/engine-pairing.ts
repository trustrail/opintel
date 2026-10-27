import {isIP} from 'node:net';
import {readFileSync,writeFileSync,existsSync,chmodSync,openSync,closeSync,fsyncSync,linkSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes,createHash,timingSafeEqual,X509Certificate} from 'node:crypto';
import {createServer,request} from 'node:https';
import {checkServerIdentity,type TLSSocket} from 'node:tls';
import {z} from 'zod';

export const pairingIdentity=z.strictObject({version:z.literal(1),kind:z.enum(['gateway','engine']),address:z.url(),certificate:z.string().max(32768),ca:z.string().max(32768),pin:z.string(),demoSourceUrl:z.string().optional()});
type Identity=z.infer<typeof pairingIdentity>;
const codeState=z.strictObject({code:z.string(),expiresAt:z.number().int(),pin:z.string()});
const read=(file:string):unknown=>JSON.parse(readFileSync(file,'utf8')) as unknown;
function durable(file:string,value:unknown,exclusive=false){
 const temporary=exclusive?file+'.pending-'+randomBytes(8).toString('hex'):file;
 const fd=openSync(temporary,exclusive?'wx':'w',0o600);
 try{writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fsyncSync(fd);}finally{closeSync(fd);}
 if(exclusive){try{linkSync(temporary,file);}finally{unlinkSync(temporary);}}
 chmodSync(file,0o600);
}
export function verifyPairingIdentity(value:unknown,kind:'gateway'|'engine',pin?:string):Identity{
 const identity=pairingIdentity.parse(value),certificate=new X509Certificate(identity.certificate),ca=new X509Certificate(identity.ca),address=new URL(identity.address);
 if(identity.kind!==kind||identity.pin!==certificate.fingerprint256||(pin&&identity.pin.replaceAll(':','')!==pin)||!ca.ca||!certificate.verify(ca.publicKey)||Date.parse(certificate.validTo)<=Date.now()||Date.parse(certificate.validFrom)>Date.now())throw new Error('Pairing certificate verification failed.');
 if(address.protocol!=='https:'||address.username||address.password||address.search||address.hash||!['','/'].includes(address.pathname))throw new Error('Pairing address must be an HTTPS origin.');
 const host=address.hostname.replace(/^\[|\]$/gu,'');
 if(!(isIP(host)?certificate.checkIP(host):certificate.checkHost(host)))throw new Error('Pairing address does not match the certificate.');
 if(kind==='engine'){const source=new URL(z.string().parse(identity.demoSourceUrl));if(source.protocol!=='postgresql:'||source.hostname!==address.hostname)throw new Error('Demo source does not match the engine identity.');}
 return identity;
}
export function issuePairingCode(root:string,renew=false):string{
 const state=join(root,'state');if(existsSync(join(state,'peer.json')))throw new Error('Engine already paired; its trust cannot be replaced.');
 const identity=pairingIdentity.parse(read(join(root,'trust.json'))),file=join(state,'pairing-code.json');
 if(!renew&&existsSync(file)){const saved=codeState.parse(read(file));if(saved.expiresAt>Date.now()&&saved.pin===identity.pin)return saved.code;throw new Error('Pairing code expired. Run ./pairing-code on the engine host.');}
 const code='v1.'+identity.pin.replaceAll(':','')+'.'+randomBytes(32).toString('base64url');
 durable(file,{code,pin:identity.pin,expiresAt:Date.now()+15*60*1000});return code;
}
function applyEnginePeer(root:string,peer:Identity){
 const state=join(root,'state');
 // Update the CA before the pin file; runtimes reload only a complete pinned pair.
 writeFileSync(join(state,'peer-ca.pem'),peer.ca,{mode:0o600});chmodSync(join(state,'peer-ca.pem'),0o600);
 writeFileSync(join(state,'application.pem'),peer.certificate,{mode:0o600});chmodSync(join(state,'application.pem'),0o600);
}
const permissions={'/health':'readiness','/pair':'single_use_engine_pairing_code','/result':'recorded_gateway_certificate'} as const;
export async function servePairing(root:string,port=3103){
 const state=join(root,'state'),peerFile=join(state,'peer.json');
 let peer=existsSync(peerFile)?verifyPairingIdentity(read(peerFile),'gateway'):undefined;
 if(peer)applyEnginePeer(root,peer);
 let busy=false;let refused=0;let windowStart=Date.now();
 const server=createServer({cert:readFileSync(join(state,'engine.pem')),key:readFileSync(join(state,'engine.key')),minVersion:'TLSv1.3',requestCert:true,rejectUnauthorized:false},(req,res)=>{
  const send=(status:number,value:unknown)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value));};
  const path=req.url??'';
  if(!Object.hasOwn(permissions,path)){req.resume();send(404,{message:'Unknown pairing operation.'});return;}
  if(path==='/health'&&req.method==='GET'){send(200,{ready:true});return;}
  if(path==='/result'&&req.method==='POST'){
   const certificate=(req.socket as TLSSocket).getPeerCertificate();
   if(!peer||certificate.fingerprint256!==peer.pin){req.resume();send(403,{message:'Recorded gateway certificate required.'});return;}
   req.resume();send(200,read(join(state,'gateway-registration.json')));return;
  }
  if(path!=='/pair'||req.method!=='POST'){req.resume();send(405,{message:'Unsupported pairing operation.'});return;}
  if(Date.now()-windowStart>60000){windowStart=Date.now();refused=0;}
  if(busy||refused>=10){req.resume();send(429,{message:'Pairing busy or rate limited.'});return;}
  busy=true;
  void(async()=>{
   try{
    let length=0;const chunks:Buffer[]=[];
    for await(const chunk of req){const bytes=Buffer.from(chunk as Uint8Array);length+=bytes.length;if(length>98304)throw new Error('Pairing request too large.');chunks.push(bytes);}
    const body=z.strictObject({code:z.string().max(160),identity:pairingIdentity}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if(peer||existsSync(peerFile))throw new Error('Engine is already paired.');
    const saved=codeState.parse(read(join(state,'pairing-code.json'))),identity=pairingIdentity.parse(read(join(root,'trust.json')));
    const hash=(value:string)=>createHash('sha256').update(value).digest();
    if(saved.expiresAt<=Date.now()||saved.pin!==identity.pin||!timingSafeEqual(hash(saved.code),hash(body.code)))throw new Error('Pairing code invalid or expired.');
    const accepted=verifyPairingIdentity(body.identity,'gateway');
    // Exclusive durable peer creation consumes the code, even if the response is lost.
    durable(peerFile,accepted,true);peer=accepted;applyEnginePeer(root,accepted);
    console.info({event:'auth.engine_paired',timestamp:new Date().toISOString()});
    send(200,read(join(state,'gateway-registration.json')));
   }catch{refused++;console.info({event:'auth.engine_pairing_refused',timestamp:new Date().toISOString()});send(409,{message:'Pairing refused: code invalid, expired, consumed, or peer identity invalid. No existing peer was replaced.'});}
   finally{busy=false;}
  })();
 });
 server.requestTimeout=5000;server.headersTimeout=5000;server.setTimeout(5000,socket=>socket.destroy());server.maxConnections=16;
 server.on('tlsClientError',()=>{});
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,'0.0.0.0',resolve);});
 return server;
}
export async function claimEngine(root:string,address:string,code:string,pairingPort=3103):Promise<Identity>{
 const matched=/^v1\.([A-F0-9]{64})\.([A-Za-z0-9_-]{43})$/u.exec(code);if(!matched)throw new Error('Invalid pairing code format.');
 const pin=matched[1]!,endpoint=new URL(address);
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||!['','/'].includes(endpoint.pathname))throw new Error('Engine address must be an HTTPS origin.');
 const publicIdentity=verifyPairingIdentity(read(join(root,'trust.json')),'gateway');
 const installed=z.object({address:z.string()}).parse(read(join(root,'state/installed.json')));
 const originalHost=endpoint.hostname.replace(/^\[|\]$/gu,'');endpoint.port=String(pairingPort);
 // Docker Desktop cannot reliably hairpin its own LAN address. Preserve the
 // verified original hostname while dialing the host route on a single laptop.
 if(endpoint.hostname===installed.address)endpoint.hostname='host.docker.internal';
 const call=(path:string,body?:string)=>new Promise<{status:number;value:unknown}>((resolve,reject)=>{
  let sent=false;
  const req=request(new URL(path,endpoint),{method:'POST',agent:false,cert:readFileSync(join(root,'state/application.pem')),key:readFileSync(join(root,'state/application.key')),rejectUnauthorized:false,minVersion:'TLSv1.3',signal:AbortSignal.timeout(10000),headers:{'content-type':'application/json','content-length':Buffer.byteLength(body??'')}},res=>{
   const chunks:Buffer[]=[];let length=0;res.on('error',()=>reject(new Error('Pairing response interrupted. Run the same command to recover.')));res.on('data',(chunk:Buffer)=>{length+=chunk.length;if(length>98304)res.destroy();else chunks.push(chunk);});res.on('end',()=>{try{resolve({status:res.statusCode??0,value:JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown});}catch{reject(new Error('Invalid pairing response.'));}});
  });
  req.once('socket',socket=>socket.once('secureConnect',()=>{
   const certificate=(socket as TLSSocket).getPeerCertificate();
   if(certificate.fingerprint256?.replaceAll(':','')!==pin||checkServerIdentity(originalHost,certificate)){req.destroy(new Error('Engine pairing pin or hostname mismatch.'));return;}
   sent=true;req.end(body);
  }));
  req.on('error',()=>reject(new Error(sent?'Pairing transport failed after sending. Repeat the command to recover through your recorded gateway identity.':'Pairing TLS verification or connection failed before sending. Check engine address and code.')));
 });
 const recovered=await call('/result');
 const response=recovered.status===200?recovered:await call('/pair',JSON.stringify({code,identity:publicIdentity}));
 if(response.status!==200)throw new Error('Pairing refused. Check expiry, existing registration and the engine pairing log; no trust was overwritten.');
 const peer=verifyPairingIdentity(response.value,'engine',pin);
 if(new URL(peer.address).origin!==new URL(address).origin)throw new Error('Engine registration address differs from the requested engine.');
 return peer;
}

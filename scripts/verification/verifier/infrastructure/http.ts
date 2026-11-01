import {privateRead} from '../../../operator/private-input.js';
import {isIP} from 'node:net';
import {request} from 'node:https';
import {Readable} from 'node:stream';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import type {PublicApi} from '../../../soak/public-setup.js';
/** Installed HTTPS adapter; optional loopback routing retains Host/SNI/CA checks. */
export async function installationHttp(base:string,cookieFile:string,caFile:string,connectAddress?:string){
 const origin=new URL(base);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/')throw new Error('Use the installation HTTPS origin');
 const ca=await readFile(caFile),nativeFetch=globalThis.fetch;
 const fetcher:typeof fetch=async(input,init)=>{
  const incoming=new Request(input,init),url=new URL(incoming.url);
  if(url.origin!==origin.origin)return nativeFetch(input,init);
  const bytes=incoming.body?Buffer.from(await incoming.arrayBuffer()):undefined;
  return new Promise<Response>((resolve,reject)=>{
   const req=request({hostname:connectAddress??url.hostname,port:url.port||443,servername:isIP(url.hostname)?undefined:url.hostname,path:url.pathname+url.search,method:incoming.method,headers:{...Object.fromEntries(incoming.headers),host:url.host},ca,signal:incoming.signal,timeout:30000},res=>{
    const headers=new Headers();for(const [key,value]of Object.entries(res.headers)){if(Array.isArray(value))for(const v of value)headers.append(key,v);else if(value!==undefined)headers.set(key,value);}
    resolve(new Response([204,205,304].includes(res.statusCode??0)?null:Readable.toWeb(res) as ReadableStream<Uint8Array>,{status:res.statusCode,headers}));
   });req.on('error',reject);req.on('timeout',()=>req.destroy(new Error('Installed HTTPS deadline exceeded')));req.end(bytes);
  });
 };
 const call:PublicApi=async(path,method='GET',body)=>{
  if(!path.startsWith('/api/v1/'))throw new Error('Only public console APIs are allowed');
  const cookie=(await privateRead(cookieFile)).trim();if(!/^opintel_session=[^;\s]+$/u.test(cookie))throw new Error('Normal administrator login required');
  if(/postgres(?:ql)?:\/\//u.test(JSON.stringify(body)??''))throw new Error('Source credentials must remain on the engine');
  const response=await fetcher(new URL(path,base),{method,headers:{cookie,origin:origin.origin,'content-type':'application/json','idempotency-key':randomUUID()},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(30000)});
  if(!response.ok){await response.body?.cancel();throw new Error(`Public API ${method} ${new URL(path,base).pathname} refused HTTP ${response.status}`);}return response.status===204?null:await response.json() as unknown;
 };
 return {fetcher,call};
}

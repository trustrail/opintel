import {timingSafeEqual,X509Certificate} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {DomainError} from '../../shared/kernel/index.js';
export type ClientCertificate={fingerprint:string;subject:string};
const certificates=new WeakMap<IncomingMessage,ClientCertificate>();
/** Only the protected ingress knows this per-install proof. Client headers are
 * overwritten there; direct API callers cannot promote a PEM to TLS identity. */
export function acceptIngressIdentity(request:IncomingMessage,proof:string|undefined):void{
 const raw=request.headers['x-opintel-client-certificate'],supplied=request.headers['x-opintel-ingress-proof'];
 delete request.headers['x-opintel-client-certificate'];delete request.headers['x-opintel-ingress-proof'];
 if(raw===undefined&&supplied===undefined)return;
 if(!proof||proof.length<32||typeof supplied!=='string'||Buffer.byteLength(supplied)!==Buffer.byteLength(proof)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(proof)))throw new DomainError('forbidden','Client certificate headers are accepted only through the trusted ingress.');
 if(raw===undefined||raw==='')return;
 try{
  if(typeof raw!=='string'||raw.length>16384)throw new Error('Invalid certificate');
  const certificate=new X509Certificate(decodeURIComponent(raw));
  certificates.set(request,{fingerprint:certificate.fingerprint256.replaceAll(':','').toLowerCase(),subject:certificate.subject});
 }catch{throw new DomainError('unauthenticated','The ingress client certificate is invalid.');}
}
export function requestClientCertificate(request:IncomingMessage):ClientCertificate|undefined{return certificates.get(request);}

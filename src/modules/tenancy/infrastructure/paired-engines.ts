import {readFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
import {z} from 'zod';
import {withPlatform} from '../../../platform/db/scope.js';
import {EngineRegistration} from '../../../shared/api/engines.js';
import {PairedEngineCandidate} from '../../../shared/api/tenancy-schemas.js';
import type {InstallationEngines,PairedEngineCandidates} from '../application/paired-engines.js';
const Peer=z.object({kind:z.literal('engine'),address:z.string(),pin:z.string(),certificate:z.string(),ca:z.string(),name:z.string().optional()});
export class FileInstallationEngines implements InstallationEngines {
 constructor(private readonly file=process.env.INSTALLATION_PAIRING_FILE??(process.env.APPLICATION_TLS_CONFIG?join(dirname(process.env.APPLICATION_TLS_CONFIG),'peer.json'):null)){}
 async read(){
  if(!this.file)return [];
  let text:string;try{text=await readFile(this.file,'utf8');}catch(e){if(e&&typeof e==='object'&&'code'in e&&e.code==='ENOENT')return [];throw e;}
  const peers=z.union([Peer,z.array(Peer)]).parse(JSON.parse(text) as unknown),result=[];
  for(const peer of Array.isArray(peers)?peers:[peers]){
   const certificate=new X509Certificate(peer.certificate),ca=new X509Certificate(peer.ca),pin=peer.pin.replaceAll(':','').toUpperCase();
   if(!ca.ca||!certificate.verify(ca.publicKey)||Date.parse(certificate.validFrom)>Date.now()||Date.parse(certificate.validTo)<=Date.now()||certificate.fingerprint256.replaceAll(':','')!==pin)throw new Error('Installation pairing identity is invalid.');
   const host=new URL(peer.address).hostname.replace(/^\[|\]$/gu,'');if(!certificate.checkHost(host)&&!certificate.checkIP(host))throw new Error('Installation pairing address is invalid.');
   const registration=EngineRegistration.parse({name:peer.name??'Paired engine',address:peer.address,certificatePin:pin});
   result.push({...registration,id:createHash('sha256').update(pin).digest('hex')});
  }
  return [...new Map(result.map(p=>[p.id,p])).values()];
 }
}
export class PostgresPairedEngineCandidates implements PairedEngineCandidates {
 constructor(private readonly installation:InstallationEngines=new FileInstallationEngines()){}
 async list(company:Parameters<PairedEngineCandidates['list']>[0],actor:Parameters<PairedEngineCandidates['list']>[1]){
  const candidates=await this.installation.read();
  return withPlatform(async tx=>{const [row]=await tx.query<{value:unknown}>('SELECT first_run_paired_engines($1,$2,NULL,$3::jsonb,NULL) AS value',[company,actor,JSON.stringify(candidates)]);return z.object({candidates:z.array(PairedEngineCandidate)}).parse(row?.value).candidates;});
 }
}

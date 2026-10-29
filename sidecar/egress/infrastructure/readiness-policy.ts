import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import {engineSecretStore} from '../../infrastructure/source-secrets.js';
import {SecretRef} from '../../../src/platform/secrets/types.js';

const bootstrapConfig=z.object({postgresReadinessSource:z.string().startsWith('secret://').min(10)});
export async function readinessPolicy(file:string){
 const config=bootstrapConfig.parse(JSON.parse(await readFile(file,'utf8')));
 const credential=await engineSecretStore().resolve(SecretRef(config.postgresReadinessSource));
 const uri=new URL(credential);
 if(!['postgres:','postgresql:'].includes(uri.protocol)||!uri.hostname)throw new Error('Invalid readiness source connection.');
 for(const name of ['host','hostaddr','port','service','connectionString'])if(uri.searchParams.has(name))throw new Error('Readiness source routing overrides are unsupported.');
 const host=uri.hostname.replace(/^\[|\]$/gu,''),port=z.coerce.number().int().min(1).max(65535).parse(uri.port||5432);
 let timer:ReturnType<typeof setTimeout>|undefined;
 try{
  const addresses=isIP(host)?[{address:host}]:await Promise.race([lookup(host,{all:true}),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Readiness source resolution timed out.')),3000);})]);
  if(!addresses.length)throw new Error('Readiness source has no addresses.');
  return {version:1,readinessRef:config.postgresReadinessSource,sources:[...new Set(addresses.map(value=>value.address))].sort().map(address=>({address,port}))};
 }finally{clearTimeout(timer);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 void readinessPolicy(process.env.SIDECAR_CONFIG_FILE??'/config/service.json').then(policy=>process.stdout.write(JSON.stringify(policy)+'\n')).catch(()=>{
  process.stderr.write('Cannot derive readiness-source egress. Check its secret reference, PostgreSQL URI and name resolution.\n',()=>process.exit(1));
 });
}

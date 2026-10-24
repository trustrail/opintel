import {z} from 'zod';
import {withPlatform} from './scope.js';

declare const OPINTEL_MIGRATION_IDENTITIES:unknown;
const identities=z.record(z.string().regex(/^\d+_[a-z0-9_]+\.up\.(?:sql|ts)$/u),z.string().regex(/^[a-f0-9]{64}$/u));
type Applied={version:string;name:string;checksum:string};
export function assertMigrationCompatibility(expected:unknown,applied:readonly Applied[]):void{
 const required=identities.parse(expected),byVersion=new Map(applied.map(row=>[row.version,row]));
 if(!Object.keys(required).length)throw new Error('The API release has no database compatibility contract.');
 for(const [file,checksum] of Object.entries(required)){
  const version=file.slice(0,file.indexOf('_')),name=file.slice(file.indexOf('_')+1).replace(/\.up\.(?:sql|ts)$/u,'');
  const row=byVersion.get(version);
  if(!row)throw new Error('Database migrations are pending. Run the matching gateway migration job before starting the API.');
  if(row.name!==name||row.checksum!==checksum)throw new Error('Database migration checksums do not match this API release.');
 }
 // Forward-compatible additions allow the previous API release to keep running;
 // every migration this release knows still has to retain its original bytes.
}
export async function checkDeploymentDatabase():Promise<void>{
 if(process.env.NODE_ENV!=='production'){await withPlatform(tx=>tx.query('SELECT 1'));return;}
 if(typeof OPINTEL_MIGRATION_IDENTITIES==='undefined')throw new Error('The API release has no database compatibility contract.');
 let rows:Applied[];
 try{rows=await withPlatform(tx=>tx.query<Applied>('SELECT version,name,checksum FROM schema_migration'));}
 catch{throw new Error('Gateway PostgreSQL migration metadata is unavailable. Check DATABASE_URL and run the gateway migration job.');}
 assertMigrationCompatibility(OPINTEL_MIGRATION_IDENTITIES,rows);
}

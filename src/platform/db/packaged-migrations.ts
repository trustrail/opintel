import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';

const digest=z.string().regex(/^[a-f0-9]{64}$/u);
const artifact=z.strictObject({file:z.string().regex(/^\d+_[a-z0-9_]+\.(?:up|down)\.mjs$/u),sha256:digest});
const manifestSchema=z.strictObject({version:z.literal(1),migrations:z.array(z.strictObject({
 version:z.string().regex(/^\d+$/u),name:z.string().regex(/^[a-z0-9_]+$/u),
 // This is the immutable original up-file identity, not the compiled hash.
 checksum:digest,up:artifact,down:artifact,
})).min(1)});

export type MigrationSource={version:string;name:string;checksum:string;upPath:string;downPath:string};

/** A build manifest preserves the existing ledger while verifying executable bytes. */
export async function packagedMigrations(directory:string):Promise<MigrationSource[]|null>{
 let text:string;
 try{text=await readFile(join(directory,'manifest.json'),'utf8');}
 catch(error){if(error instanceof Error&&'code' in error&&error.code==='ENOENT')return null;throw error;}
 const manifest=manifestSchema.parse(JSON.parse(text) as unknown),versions=new Set<string>();
 const result:MigrationSource[]=[];
 for(const entry of manifest.migrations){
  if(versions.has(entry.version))throw new Error('Duplicate packaged migration version.');
  versions.add(entry.version);
  for(const direction of ['up','down'] as const){
   const payload=entry[direction];
   if(payload.file!==`${entry.version}_${entry.name}.${direction}.mjs`)throw new Error('Packaged migration filename mismatch.');
   const bytes=await readFile(join(directory,payload.file));
   if(createHash('sha256').update(bytes).digest('hex')!==payload.sha256)throw new Error('Packaged migration artifact checksum mismatch.');
  }
  result.push({version:entry.version,name:entry.name,checksum:entry.checksum,upPath:join(directory,entry.up.file),downPath:join(directory,entry.down.file)});
 }
 return result.sort((a,b)=>a.version.localeCompare(b.version));
}

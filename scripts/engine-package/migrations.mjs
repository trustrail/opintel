import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
/** Compile execution assets; never rename or recalculate an applied ledger identity. */
export async function bundleMigrations(source,destination){
 await mkdir(destination,{recursive:true});
 const entries=new Map(),files=[];
 for(const file of (await readdir(source)).sort()){
  const match=/^(\d+)_([a-z0-9_]+)\.(up|down)\.(sql|ts)$/u.exec(file);
  if(!match)continue;
  const [,version,name,direction,extension]=match;
  const entry=entries.get(version)??{version,name};
  if(entry.name!==name||entry[direction])throw new Error('Duplicate migration identity.');
  const bytes=await readFile(join(source,file)),output=`${version}_${name}.${direction}.mjs`;
  await build({...(extension==='sql'?{stdin:{contents:`export default async function migrate(client){await client.query(${JSON.stringify(bytes.toString('utf8'))});}`,loader:'js'}}:{entryPoints:[resolve(source,file)]}),
   outfile:join(destination,output),bundle:true,minify:true,sourcemap:false,platform:'node',format:'esm',target:'node22',legalComments:'eof',
   banner:{js:'import {createRequire} from "node:module";const require=createRequire(import.meta.url);'},logLevel:'warning'});
  entry[direction]={file:output,sha256:hash(await readFile(join(destination,output)))};
  if(direction==='up')entry.checksum=hash(bytes);
  entries.set(version,entry);files.push(output);
 }
 if(!entries.size)throw new Error('No migrations found.');
 for(const entry of entries.values())if(!entry.up||!entry.down)throw new Error('Migration requires both directions.');
 await writeFile(join(destination,'manifest.json'),JSON.stringify({version:1,migrations:[...entries.values()]},null,2)+'\n');
 return [...files,'manifest.json'];
}

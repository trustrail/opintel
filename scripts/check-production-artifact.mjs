import console from 'node:console';
import {readdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
const forbidden=['/dev/kitchen-sink','/dev/shared-patterns'];
async function check(path){
 for(const entry of await readdir(path,{withFileTypes:true})){
  const file=join(path,entry.name);
  if(entry.isDirectory())await check(file);
  else {
   const text=await readFile(file);
   for(const route of forbidden)if(text.includes(route))throw new Error(`Production artifact contains forbidden review route ${route}: ${file}`);
  }
 }
}
await check('dist');
console.log('Production artifact: both review routes absent.');

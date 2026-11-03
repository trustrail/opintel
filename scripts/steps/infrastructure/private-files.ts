import {constants} from 'node:fs';
import {lstat,open,mkdir,unlink} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
export async function privateRead(file:string){const handle=await open(file,constants.O_RDONLY|constants.O_NOFOLLOW);try{const info=await handle.stat();if(!info.isFile()||(info.mode&0o777)!==0o600||info.size>64*1024*1024)throw new Error('Input file must be a regular mode-600 file.');return await handle.readFile('utf8');}finally{await handle.close();}}
export async function outputAbsent(file:string){try{await lstat(file);throw new Error('Output file already exists; choose a new file.');}catch(error){if(!(error instanceof Error&&'code'in error&&error.code==='ENOENT'))throw error;}}
export async function privateWrite(file:string,text:string){
 await mkdir(dirname(file),{recursive:true,mode:0o700});
 await outputAbsent(file);
 const temporary=join(dirname(file),'.steps-'+randomUUID());const handle=await open(temporary,'wx',0o600);
 try{await handle.writeFile(text);await handle.sync();}finally{await handle.close();}
 // link() provides create-only publication: no symlink or overwrite race.
 try{const {link}=await import('node:fs/promises');await link(temporary,file);}finally{await unlink(temporary);}
}

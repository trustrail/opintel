import {constants,openSync,fstatSync,writeSync,fsyncSync,closeSync,unlinkSync,lstatSync,readdirSync,rmdirSync} from 'node:fs';
import {join} from 'node:path';
import {Buffer} from 'node:buffer';
/** Overwrite the live file before unlinking. This is not secure erasure of SSD,
 * snapshot or copy-on-write history; private ephemeral storage is still required. */
export function wipePrivateFile(path){
 const fd=openSync(path,constants.O_WRONLY|constants.O_NOFOLLOW);
 try{
  const info=fstatSync(fd);if(!info.isFile())throw new Error('Private cleanup expected a regular file');
  const zeros=Buffer.alloc(Math.min(info.size,65536));let offset=0;
  while(offset<info.size)offset+=writeSync(fd,zeros,0,Math.min(zeros.length,info.size-offset),offset);
  fsyncSync(fd);
 }finally{closeSync(fd);}
 unlinkSync(path);
}
export function wipePrivateDirectory(path){
 let info;try{info=lstatSync(path);}catch(error){if(error?.code==='ENOENT')return;throw error;}
 if(info.isSymbolicLink()){unlinkSync(path);return;}
 if(!info.isDirectory()){wipePrivateFile(path);return;}
 for(const name of readdirSync(path))wipePrivateDirectory(join(path,name));
 rmdirSync(path);
}

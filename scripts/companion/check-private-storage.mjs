// Runs inside the companion (or its stopped disk volume). Metadata only;
// never reads or prints private file contents or names.
import {readdirSync,lstatSync,statfsSync} from 'node:fs';
import {join} from 'node:path';
import process from 'node:process';
import console from 'node:console';
if(statfsSync('/tmp').type===0x01021994)throw new Error('Expected ordinary disk, not tmpfs.');
const roots=readdirSync('/tmp');
if(process.env.CHECK_REMOVED==='1'){
 if(roots.length)throw new Error('Private storage was not cleared.');
 console.info('Disk-backed storage: empty after SIGTERM.');
}else{
 if(roots.length!==1)throw new Error('Expected one private session directory.');
 let files=0;
 const check=path=>{const info=lstatSync(path);if(info.isSymbolicLink())throw new Error('Unexpected symlink inside private storage.');if(info.isDirectory()){if((info.mode&0o777)!==0o700)throw new Error('Directory is not mode 700.');for(const name of readdirSync(path))check(join(path,name));}else{if(!info.isFile()||(info.mode&0o777)!==0o600)throw new Error('File is not mode 600.');files++;}};
 for(const name of roots)check(join('/tmp',name));
 if(files<6)throw new Error('Private identity files were not created.');
 console.info('Disk-backed storage: private directories mode 700; files mode 600.');
}

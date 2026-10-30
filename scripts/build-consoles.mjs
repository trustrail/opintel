import process from 'node:process';
import {spawnSync} from 'node:child_process';
import {rmSync,cpSync} from 'node:fs';
import {resolve,join,sep} from 'node:path';
const args=process.argv.slice(2),outIndex=args.indexOf('--outDir'),directory=resolve(outIndex<0?'dist':args[outIndex+1]??'');
if(directory!==resolve('dist')&&!directory.startsWith(resolve('tmp')+sep))throw new Error('Console output must be dist or a directory under tmp.');
if(outIndex>=0)args.splice(outIndex,2);rmSync(directory,{recursive:true,force:true});
for(const [config,out] of [['vite.legacy.config.ts',join(directory,'legacy')],['src/console-next/vite.config.ts',directory]]){
 const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config',config,'--outDir',out,...args],{stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status??1);
}

cpSync('public',directory,{recursive:true});

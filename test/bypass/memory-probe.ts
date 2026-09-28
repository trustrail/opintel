import { readdir } from 'node:fs/promises';
import { TwoSessionExecutor } from '../../sidecar/session/index.js';
const executor=new TwoSessionExecutor(),before=await readdir(process.cwd(),{recursive:true});
let message='';
try{await executor.execute('SELECT count(*) FROM (SELECT i FROM range(10000000) t(i) GROUP BY i)',{memoryMb:16,threads:1});}
catch(error:unknown){message=error instanceof Error?error.message:String(error);}
const settings=await executor.execute("SELECT current_setting('temp_directory'),current_setting('max_temp_directory_size')",{memoryMb:16,threads:1});
console.log(JSON.stringify({message,before,after:await readdir(process.cwd(),{recursive:true}),settings:settings.rows}));

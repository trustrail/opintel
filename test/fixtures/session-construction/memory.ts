import { readdir } from 'node:fs/promises';
import { TwoSessionExecutor } from '../../../sidecar/session/index.js';
const executor=new TwoSessionExecutor();
let message='';
try { await executor.execute('SELECT count(*) FROM (SELECT i FROM range(10000000) t(i) GROUP BY i)',{memoryMb:16,threads:1}); }
catch(error:unknown){message=error instanceof Error?error.message:String(error);}
console.log(JSON.stringify({message,files:await readdir(process.cwd(),{recursive:true})}));

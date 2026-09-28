import { readdir } from 'node:fs/promises';
import { TwoSessionExecutor,DuckDBSessionEngine,type InspectionEvent } from '../../sidecar/session/index.js';
import { InspectedSessionExecutor } from '../../sidecar/sql/index.js';
const executor=new TwoSessionExecutor(),before=await readdir(process.cwd(),{recursive:true});
const events:InspectionEvent[]=[],record=(event:InspectionEvent)=>events.push(event);
const inspected=new InspectedSessionExecutor(new DuckDBSessionEngine(undefined,record),record);
let message='',code:string|undefined;
try{
 const result=await inspected.execute('SELECT count(*) FROM (SELECT i FROM range(10000000) t(i) GROUP BY i)',{memoryMb:16,threads:1},{catalog:'memory',schema:'main',objects:[]},{readPlan:[],entitlements:[],aggregateMinGroupSize:5});
 if(!result.ok){message=result.error.message;code=result.error.code;}
}
catch(error:unknown){message=error instanceof Error?error.message:String(error);}
const settings=await executor.execute("SELECT current_setting('temp_directory'),current_setting('max_temp_directory_size')",{memoryMb:16,threads:1});
console.log(JSON.stringify({message,code,before,after:await readdir(process.cwd(),{recursive:true}),settings:settings.rows,events}));

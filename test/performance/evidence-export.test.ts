import {setFlagsFromString} from 'node:v8';
import {runInNewContext} from 'node:vm';
import {it,expect} from 'vitest';
import {resetDatabaseBeforeEach} from '../database-fixture.js';
import {exportFixture} from '../fixtures/evidence-export/fixture.js';
import {withTenant} from '../../src/platform/db/scope.js';
resetDatabaseBeforeEach('company');
// Measure live retention rather than the VM's discretionary garbage-collection
// threshold. Collection is test-only; production streaming never invokes it.
setFlagsFromString('--expose_gc');
const collect=runInNewContext('gc') as ()=>void;
it('M-008: 100k records stream as NDJSON and CSV with bounded memory and database pages',async()=>{
 const f=await exportFixture();try{
  await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at)
   SELECT $1,$2,'export-load','opk_test','query','SELECT 1','{"policy":1,"catalog":1,"vocabulary":1,"tokenKeyVersionSelected":null}',$3::timestamptz+i*interval '1 millisecond' FROM generate_series(1,100000) i`,[f.ctx.projectId,f.pool,new Date(Date.now()-200000).toISOString()]));
  const read=f.repository.page.bind(f.repository);let pages=0,maxPage=0;f.repository.page=async(...args)=>{const rows=await read(...args);pages++;if(rows.ok)maxPage=Math.max(maxPage,rows.value.length);return rows;};
  for(const format of ['ndjson','csv'] as const){const link=await f.link({format,filters:{}});collect();const baseline=process.memoryUsage().heapUsed;let maximum=baseline,retained=baseline,nextSample=10000,lines=0,bytes=0;const began=performance.now();
   const response=await fetch(f.base+link.downloadUrl);expect(response.status).toBe(200);const body=response.body;if(!body)throw new Error('Missing body');
   for await(const chunk of body){bytes+=chunk.byteLength;for(const byte of chunk)if(byte===10)lines++;maximum=Math.max(maximum,process.memoryUsage().heapUsed);if(lines>=nextSample){collect();retained=Math.max(retained,process.memoryUsage().heapUsed);nextSample+=10000;}}
   expect(lines).toBe(100000+(format==='csv'?1:0));expect(retained-baseline).toBeLessThan(16*1024*1024);expect(bytes).toBeGreaterThan(20000000);
   console.info({test:'M-008',format,records:100000,bytes,heapGrowth:maximum-baseline,retainedGrowth:retained-baseline,milliseconds:performance.now()-began});
  }
  expect(maxPage).toBe(100);expect(pages).toBe(2002);
 }finally{await f.close();}
},180000);

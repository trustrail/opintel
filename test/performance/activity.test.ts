import {randomUUID} from 'node:crypto';
import {it,expect} from 'vitest';
import {withTenant} from '../../src/platform/db/scope.js';
import {policyFixture,unwrap} from '../fixtures/policy-version/fixture.js';
import {resetDatabaseBeforeEach} from '../database-fixture.js';
import {PostgresEvidenceReader} from '../../src/modules/evidence/index.js';
resetDatabaseBeforeEach('company');
it('M-007: pool and range filtering over 1M records takes under 500ms',async()=>{
 const f=await policyFixture(1),now=new Date(),start=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),1));
 const otherPool=randomUUID();await withTenant(f.ctx,tx=>tx.query("INSERT INTO pool(id,project_id,name) VALUES($1,$2,'Background pool')",[otherPool,f.ctx.projectId]));
 await withTenant(f.ctx,tx=>tx.query(`INSERT INTO query_run(id,project_id,pool_id,agent_id,key_prefix,mode,request,versions,started_at)
 SELECT gen_random_uuid(),$1,CASE WHEN i%100=0 THEN $2::uuid ELSE $3::uuid END,'performance','opk_prefix','query','SELECT 1','{"policy":1,"vocabulary":1,"catalog":1,"tokenKeyVersionSelected":null}',$4::timestamptz+i*interval '1 second' FROM generate_series(1,1000000) i`,[f.ctx.projectId,f.pool,otherPool,start.toISOString()]));
 const reader=new PostgresEvidenceReader(),filters={poolId:f.pool,from:new Date(start.getTime()+100000*1000).toISOString(),to:new Date(start.getTime()+900000*1000).toISOString()};
 const times:number[]=[];for(let i=0;i<5;i++){const began=performance.now();const result=unwrap(await reader.list(f.ctx,filters,null,51));times.push(performance.now()-began);expect(result).toHaveLength(51);expect(result.every(r=>r.poolId===f.pool&&r.startedAt>=filters.from&&r.startedAt<filters.to)).toBe(true);}
 console.info({test:'M-007',records:1000000,milliseconds:times});expect(Math.max(...times)).toBeLessThan(500);
},180000);

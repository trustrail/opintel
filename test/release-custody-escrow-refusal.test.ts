import {createServer} from 'node:http';
import {once} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {LocalReleaseProvider,XqReleaseProvider} from '../src/modules/release-custody/index.js';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {queryFixture} from './fixtures/query/fixture.js';

const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{vi.restoreAllMocks();for(const close of cleanup.splice(0).reverse())await close();});

for(const failure of ['http-412','network','timeout'] as const){
 it(`custody escrow ${failure}: refuses the entire MCP result and persists refusal evidence`,async()=>{
  const requests:Array<{url:string|undefined;method:string|undefined}>=[];
  const server=createServer((request,response)=>{
   requests.push({url:request.url,method:request.method});
   request.resume();
   if(failure==='http-412'){
    response.writeHead(412,{'content-type':'application/json'});
    response.end(JSON.stringify({status:'You do not have the required rights to use this service',right:'transfer/data'}));
   }else if(failure==='network')request.socket.destroy();
   // Timeout deliberately leaves the request unanswered: exercise the real
   // worker's 15-second fetch deadline, without changing production timers.
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  cleanup.push(async()=>{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));});
  const address=server.address();if(!address||typeof address==='string')throw new Error('Missing mock provider listener');
  const base=`http://127.0.0.1:${address.port}`;
  const provider=new XqReleaseProvider({apiKey:'test-api-key',dashboardApiKey:'',senderAlias:'test-sender',senderAccessToken:'test-access-token',subscriptionUrl:base+'/subscription',validationUrl:base+'/validation'},'test',base+'/validation/key');
  const f=await queryFixture(new PostgresEvidenceWriter(),{releaseCustody:true});cleanup.push(f.close);
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  // Keep real query preparation, Engine sealing, QueryRelease and durable
  // evidence. Only substitute the fixture's escrow transport with real XQ SDK
  // workers pointed at the controlled HTTP peer; no live XQ credentials.
  const escrow=vi.spyOn(LocalReleaseProvider.prototype,'escrow').mockImplementation((key,alias,ttl,singleUse)=>provider.escrow(key,alias,ttl,singleUse));
  const result=await f.query("SELECT field_1, field_4, 'CLEAR_RESULT_SENTINEL' AS marker FROM warehouse.public.records LIMIT 2");
  const receipt=z.object({_meta:z.object({evidenceId:z.uuid()})}).parse(result)._meta.evidenceId;
  expect(result).toEqual({isError:true,content:[{type:'text',text:'Release custody could not prepare this answer. No result was released. Ask an administrator to check the custody provider.'}],_meta:{code:'dependency_unavailable',cause:'release_prepare_failed',retryable:false,evidenceId:receipt}});
  expect(result).not.toHaveProperty('structuredContent');
  expect(JSON.stringify(result)).not.toMatch(/CLEAR_RESULT_SENTINEL|large|opintelsealed:|transfer\/data|test-access-token/);
  expect(escrow).toHaveBeenCalledTimes(1);
  expect(requests).toEqual([{url:'/subscription/packet',method:'POST'}]);
  expect(f.boundary.executions).toBeGreaterThan(0);
  const evidence=await withTenant(f.ctx,async tx=>({
   completions:await tx.query<{outcome:unknown}>("SELECT c.outcome FROM query_run r JOIN run_completion c ON c.run_id=r.id AND c.started_at=r.started_at WHERE r.id=$1 AND r.pool_id=$2",[receipt,f.pool]),
   released:await tx.query("SELECT state FROM run_element WHERE run_id=$1 AND state IN ('released','aggregated')",[receipt]),
   stages:await tx.query<{result:string;detail:unknown}>("SELECT result,detail FROM run_stage WHERE run_id=$1 AND stage='execute'",[receipt]),
   grants:await tx.query('SELECT id FROM release_grant WHERE receipt_id=$1',[receipt]),
   events:await tx.query('SELECT kind FROM release_event WHERE receipt_id=$1',[receipt]),
  }));
  expect(evidence.completions).toEqual([{outcome:{kind:'refused',code:'dependency_unavailable',element:null,stage:'execute'}}]);
  expect(evidence.released).toEqual([]);
  expect(evidence.stages).toContainEqual({result:'refuse',detail:{code:'dependency_unavailable',message:'Custody release could not be prepared. No result was released.',cause:'release_prepare_failed'}});
  expect(evidence.grants).toEqual([]);expect(evidence.events).toEqual([]);
 },60000);
}

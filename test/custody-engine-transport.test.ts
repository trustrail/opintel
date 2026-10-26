import {afterEach,expect,it,vi} from 'vitest';
import {z} from 'zod';
import {withTenant} from '../src/platform/db/scope.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {queryFixture} from './fixtures/query/fixture.js';
const cleanup:Array<()=>Promise<void>>=[];
afterEach(async()=>{for(const close of cleanup.splice(0).reverse())await close();vi.restoreAllMocks();});
it('custody plaintext never appears in Engine HTTP response payloads; aliases and aggregates are sealed',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});cleanup.push(f.close);
 const sentinel='CUSTODY_TRANSPORT_SENTINEL_73ac';
 const logs=vi.spyOn(console,'info').mockImplementation(()=>{});
 const requestIds:string[]=[];
 await f.db(`UPDATE ${f.schema}.records SET field_4=$1`,[sentinel]);
 await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[3]]));
 const payloads:string[]=[];
 // Observe the actual bytes passed to HTTP after response schema validation,
 // before TLS, not the application's decoded or rewritten MCP result.
 f.host.server.prependListener('request',(request,response)=>{
  const end=vi.spyOn(response,'end');
  response.once('finish',()=>{for(const call of end.mock.calls){const chunk:unknown=call[0];if(typeof chunk==='string'||Buffer.isBuffer(chunk))payloads.push(request.url+' '+String(chunk));}});
 });
 for(const sql of ['SELECT field_4 FROM warehouse.public.records','WITH q AS (SELECT field_4 AS secret FROM warehouse.public.records) SELECT secret AS answer FROM q','SELECT MIN(field_4) AS first_value FROM warehouse.public.records']){
  const response=await f.query(sql);expect(response.isError,JSON.stringify(response)).not.toBe(true);
  const output=QueryOutput.parse(response.structuredContent);expect(output.rows[0]?.[0]).toMatch(/^opintelsealed:v1:/);requestIds.push(output.evidenceId);
 }
 expect(payloads.filter(p=>p.startsWith('/execute '))).toHaveLength(3);
 for(const payload of payloads)expect(payload).not.toContain(sentinel);
 for(const payload of payloads.filter(p=>p.startsWith('/execute '))){const body=JSON.parse(payload.slice('/execute '.length));expect(body.custodyShares.first).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(body.custodyShares.second).toMatch(/^[A-Za-z0-9_-]{43}$/);expect(body).not.toHaveProperty('key');}
 // TRACE-01/02: actual HTTP, scanner, treatment and sealing boundaries correlate
 // to receipts and contain no unbounded fields or custody values.
 const phase=z.strictObject({event:z.literal('engine.request_phase'),timestamp:z.iso.datetime(),requestId:z.string().max(128),phase:z.enum(['arrival','queue','validate','execute','scan','stage','treat','seal','respond']),state:z.enum(['start','end','aborted'])});
 const entries=logs.mock.calls.map(call=>phase.safeParse(call[0])).filter(result=>result.success).map(result=>result.data);
 for(const id of requestIds)expect(new Set(entries.filter(e=>e.requestId===id).map(e=>e.phase))).toEqual(new Set(['arrival','queue','validate','execute','scan','stage','treat','seal','respond']));
 expect(JSON.stringify(logs.mock.calls)).not.toContain(sentinel);
},60000);

it('documents the actual execute response, including Engine share transport',async()=>{
 const {sidecarOpenApiDocument}=await import('../src/shared/sidecar-contract.js');
 const schema=sidecarOpenApiDocument().paths['/execute']!.post.responses['200'].content['application/json'].schema;
 expect(schema.properties).toHaveProperty('custodyShares');
 expect(schema.properties).toHaveProperty('rows');
 expect(schema.properties).not.toHaveProperty('sql');
});

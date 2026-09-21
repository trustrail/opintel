import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { createRedisConnection } from '../src/platform/redis/index.js';
import { RedisProjectHub } from '../src/platform/sse/redis-hub.js';
import { projectStreamRoutes } from '../src/platform/sse/routes.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { ProjectId, UserId, SourceId, RunId, FilingId, Timestamp } from '../src/shared/kernel/index.js';
import type { AuthorizationPort, ZedToken } from '../src/modules/authz/index.js';
import { streamEventSchema, streamFamilies, streamOpenApiDocument, type StreamEvent } from '../src/shared/api/stream.js';
import { projectStreamCache } from '../src/app/stream-cache.js';
import { introspectionKeys } from '../src/app/introspection/data.js';
import { elementKeys } from '../src/app/catalog/data.js';
import type { RunView } from '../src/shared/api/introspection.js';

const project = ProjectId(randomUUID());
const sourceId = SourceId(randomUUID());
const runId = RunId(randomUUID());
afterEach(() => vi.useRealTimers());
it('S-008: progress writes existing detail and paginated list caches without refetch or invented records', async () => {
 const cache = new QueryClient(); const consumer = projectStreamCache(cache, project);
 const run: RunView = { id: runId, sourceId, state: 'reading', progress: { objects: 0, total: null }, error: null, startedAt: null, endedAt: null, diff: null };
 const key = introspectionKeys.detail(project,runId);
 cache.setQueryData(key,run);
 cache.setQueryData(introspectionKeys.list(project,sourceId),{pages:[{items:[run],nextCursor:null}],pageParams:[null]});
 const refetch = vi.fn(async()=>run);
 const observer = new QueryObserver(cache,{queryKey:key,queryFn:refetch,staleTime:Infinity});const unsubscribe = observer.subscribe(()=>{});
 for (let sequence=1;sequence<=100;sequence++) consumer.receive({type:'introspection.progress',sequence,runId,sourceId,state:'reading',objects:sequence,total:100});
 expect(cache.getQueryData<RunView>(key)?.progress.objects).toBe(100);
 expect(cache.getQueryData(introspectionKeys.list(project,sourceId))).toMatchObject({pages:[{items:[{progress:{objects:100}}]}]});
 expect(refetch).not.toHaveBeenCalled();
 consumer.receive({type:'introspection.progress',sequence:1,runId,sourceId,state:'connecting',objects:0,total:null});
 expect(cache.getQueryData<RunView>(key)?.state).toBe('reading');
 consumer.receive({type:'introspection.progress',sequence:101,runId:randomUUID(),sourceId,state:'queued',objects:0,total:null});
 expect(cache.getQueryCache().getAll()).toHaveLength(2);
 // Cancellation can commit in another process before an older progress publication arrives.
 cache.setQueryData(key,{...run,state:'cancelled'});
 consumer.receive({type:'introspection.progress',sequence:102,runId,sourceId,state:'reading',objects:10,total:null});
 expect(cache.getQueryData<RunView>(key)?.state).toBe('cancelled');
 unsubscribe();consumer.dispose();cache.clear();
});
it('S-009: a structural burst refetches each active family once, scoped to its project', async () => {
 vi.useFakeTimers();const cache=new QueryClient();const consumer=projectStreamCache(cache,project);
 const key=elementKeys.list(project,{limit:50});const refetch=vi.fn(async()=>({items:[]}));
 cache.setQueryData(key,{items:[]});const observer=new QueryObserver(cache,{queryKey:key,queryFn:refetch,staleTime:Infinity});const unsubscribe=observer.subscribe(()=>{});
 const other=elementKeys.all(randomUUID());cache.setQueryData(other,{untouched:true});
 for(let sequence=1;sequence<=30;sequence++)consumer.receive({type:'catalog.changed',sequence,sourceId});
 await vi.advanceTimersByTimeAsync(50);
 expect(refetch).toHaveBeenCalledTimes(1);expect(cache.getQueryState(other)?.isInvalidated).toBe(false);
 // Reconnect resets the sequence (including after Redis restarts) and refetches named families.
 consumer.receive({type:'snapshot',sequence:0,at:new Date().toISOString(),invalidate:['catalogElement']});await vi.advanceTimersByTimeAsync(50);expect(refetch).toHaveBeenCalledTimes(2);
 consumer.dispose();unsubscribe();cache.clear();
});

it.each([1,250])('S-010/S-011: reconnect after %i changes returns a fresh snapshot over real HTTP, never replay', async gap => {
 const url=process.env.REDIS_URL;if(!url)throw new Error('REDIS_URL is required. Run dev:up.');
 const producer=createRedisConnection({url});const consumer=createRedisConnection({url});await producer.connect();await consumer.connect();
 const publisher=new RedisProjectHub(producer.client,url);const hub=new RedisProjectHub(consumer.client,url);
 const p=ProjectId(randomUUID());let authenticated=true;let allowed=true;
 const unexpected=async():Promise<never>=>{throw new Error('Unexpected authorization call');};
 const port:AuthorizationPort={check:async request=>{expect(request.resource.id).toBe(p);expect(request.permission).toBe('view');return {allowed,token:'test' as ZedToken,checkedAt:Timestamp(new Date()),snapshotAgeMs:0};},checkMany:unexpected,explain:unexpected,write:unexpected};
 const server=createHttpServer(projectStreamRoutes(hub),{authorization:{port,currentUser:async()=>authenticated?{id:UserId(randomUUID()),email:'test@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true}:null}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');const endpoint=`http://127.0.0.1:${address.port}/api/v1/projects/${p}/stream`;
 const readers:ReadableStreamDefaultReader<Uint8Array>[]=[];
 async function connect(last='0') {
  const response=await fetch(endpoint,{headers:{'Last-Event-ID':last}});expect(response.status).toBe(200);expect(response.headers.get('content-type')).toBe('text/event-stream');
  const reader=response.body!.getReader();readers.push(reader);let buffer='';const decoder=new TextDecoder();
  return {close:()=>reader.cancel(),next:async():Promise<StreamEvent>=>{while(true){const end=buffer.indexOf('\n\n');if(end>=0){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(frame.startsWith('data: '))return streamEventSchema.parse(JSON.parse(frame.slice(6)) as unknown);continue;}const chunk=await reader.read();if(chunk.done)throw new Error('Stream ended');buffer+=decoder.decode(chunk.value,{stream:true});}}};
 }
 try {
  authenticated=false;expect((await fetch(endpoint)).status).toBe(401);authenticated=true;allowed=false;expect((await fetch(endpoint)).status).toBe(404);allowed=true;
  const first=await connect();expect(await first.next()).toMatchObject({type:'snapshot',sequence:0,invalidate:streamFamilies});
  await publisher.publish(p,{type:'source.changed',sourceId});expect(await first.next()).toEqual({type:'source.changed',sequence:1,sourceId});await first.close();
  for(let n=0;n<gap;n++)await publisher.publish(p,{type:'catalog.changed',sourceId});
  const second=await connect('1');expect(await second.next()).toMatchObject({type:'snapshot',sequence:gap+1,invalidate:streamFamilies});
  await publisher.publish(ProjectId(randomUUID()),{type:'source.changed',sourceId});
  await publisher.publish(p,{type:'filing.arrived',sourceId,filingId:FilingId(runId)});expect(await second.next()).toEqual({type:'filing.arrived',sequence:gap+2,sourceId,filingId:runId});
  await expect(publisher.publish(p,{type:'source.changed',sourceId,...{contents:'must not be sent'}})).rejects.toThrow();
  await hub.close();expect(await readers.at(-1)!.read()).toMatchObject({done:true});
 } finally {await Promise.all(readers.map(reader=>reader.cancel()));await hub.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));await producer.close();await consumer.close();}
},15000);
it('shares strict wire validation with the OpenAPI description',()=>{
 expect(streamOpenApiDocument().paths['/api/v1/projects/{id}/stream'].get['x-permission']).toBe('project#view');
 expect(streamEventSchema.safeParse({type:'source.changed',sequence:1,sourceId,filename:'private.xlsx'}).success).toBe(false);
});

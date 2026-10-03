import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {createHttpServer} from '../src/platform/http/index.js';
import {typeObservationRoutes} from '../src/modules/sources/api/type-observation-routes.js';
import {Timestamp,UserId} from '../src/shared/kernel/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
it('serves mapping observations through a permission checked route with project-bound cursors',async()=>{
 const project=randomUUID(),source=randomUUID(),user=UserId(randomUUID());let allowed=true;
 const authorization:AuthorizationPort={check:async()=>({allowed,checkedAt:Timestamp(new Date()),token:'test' as AuthorizationRevision,snapshotAgeMs:0}),checkMany:async()=>[],write:async()=>'test' as AuthorizationRevision,explain:async()=>({allowed:false,path:[]})};
 const rows=['inet','interval'].map(sourceType=>({sourceId:source,sourceName:'Warehouse',sourceType,elementCount:1,runId:randomUUID(),observedAt:new Date().toISOString()}));
 const routes=typeObservationRoutes({list:async(ctx,after,limit)=>{expect(ctx.projectId).toBe(project);return rows.filter(r=>!after||r.sourceType>after.sourceType).slice(0,limit);}});
 const server=createHttpServer(routes,{authorization:{port:authorization,currentUser:async()=>({id:user,email:'admin@example.test',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No port');const origin=`http://127.0.0.1:${address.port}`;
 try{
 const path=`/api/v1/projects/${project}/type-observations`;
 const first=await fetch(origin+path+'?limit=1');expect(first.status).toBe(200);const page=await first.json();expect(page.items).toEqual([rows[0]]);expect(page.nextCursor).toBeTruthy();
 const second=await (await fetch(origin+path+'?limit=1&cursor='+page.nextCursor)).json();expect(second).toEqual({items:[rows[1]],nextCursor:null});
 expect((await fetch(origin+path+'?cursor=bad')).status).toBe(400);
 expect((await fetch(`${origin}/api/v1/projects/${randomUUID()}/type-observations?cursor=${page.nextCursor}`)).status).toBe(400);
 allowed=false;expect((await fetch(origin+path)).status).toBe(404); // Tenant-denial deliberately hides resource existence.
 }finally{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
});

import {it,expect,vi} from 'vitest';
import {once} from 'node:events';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FileCustodyIdentities} from '../src/modules/pools/index.js';
import {custodyIdentityRoutes} from '../src/modules/pools/api/identity-routes.js';
import {CustodyIdentities,custodyIdentitiesOpenApiDocument} from '../src/shared/api/custody-identities.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {presenceFixture} from './fixtures/agent-presence/fixture.js';
import {allowBulk} from './fixtures/bulk-entitlements/fixture.js';
const identity={certificateId:223,deviceName:'device-one',recipientIdentifier:'provider-issued-public-subject'};
it('public identity manifest and contract expose only the approved public fields; malformed or key-bearing manifests fail closed',async()=>{
 const root=await mkdtemp(join(tmpdir(),'custody-public-')),file=join(root,'associations.json'),reader=new FileCustodyIdentities(file);
 try{
  expect(await reader.list()).toEqual({ok:true,value:{items:[]}});
  await writeFile(file,JSON.stringify({items:[identity]}),{mode:0o600});expect(await reader.list()).toEqual({ok:true,value:{items:[identity]}});
  for(const field of ['client.key','privateKey','transportKey','accessToken','bundlePath']){
   await writeFile(file,JSON.stringify({items:[{...identity,[field]:'SECRET_SENTINEL'}]}));const result=await reader.list();expect(result).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});expect(JSON.stringify(result)).not.toContain('SECRET_SENTINEL');
  }
  expect(CustodyIdentities.safeParse({items:[identity],privateKey:'SECRET_SENTINEL'}).success).toBe(false);
  const contract=custodyIdentitiesOpenApiDocument().paths['/api/v1/projects/{id}/custody-identities'].get;expect(contract['x-permission']).toBe('project#administer');expect(contract.responses[200].content['application/json'].schema).toHaveProperty('properties');
 }finally{await rm(root,{recursive:true,force:true});}
});
it('the read-only route requires project administration; a refused viewer never reads the manifest',async()=>{
 const f=await presenceFixture();let allowed=true;const later={...identity,certificateId:224,deviceName:'z-device'},list=vi.fn(async()=>({ok:true as const,value:{items:[later,identity]}}));
 const server=createHttpServer(custodyIdentityRoutes({list}),{authorization:{currentUser:async()=>f.actor,port:{...allowBulk,check:async request=>{expect(['view','administer']).toContain(request.permission);expect(request.resource.id).toBe(f.ctx.projectId);return {...await allowBulk.check(request),allowed:request.permission==='view'||allowed};}}}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No listener');
 try{const target=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/custody-identities`,reply=await fetch(target);expect(reply.status).toBe(200);expect(await reply.json()).toEqual({items:[identity,later],nextCursor:null});expect(reply.headers.get('cache-control')).toBe('no-store');const first=await (await fetch(target+'?limit=1')).json();expect(first).toEqual({items:[identity],nextCursor:identity.deviceName});expect(await (await fetch(target+'?limit=1&cursor='+encodeURIComponent(first.nextCursor))).json()).toEqual({items:[later],nextCursor:null});expect((await fetch(target+'?limit=101')).status).toBe(400);allowed=false;expect((await fetch(target)).status).toBe(403);expect(list).toHaveBeenCalledTimes(3);}
 finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('public handoff is idempotent, rejects conflicting recipients',async()=>{
 const {publishPublicIdentity}=await import('../scripts/steps/identity-exchange.js'),root=await mkdtemp(join(tmpdir(),'custody-handoff-')),file=join(root,'associations.json');
 try{await publishPublicIdentity(file,identity);await publishPublicIdentity(file,identity);expect(JSON.parse(await import('node:fs/promises').then(fs=>fs.readFile(file,'utf8')))).toEqual({items:[identity]});await expect(publishPublicIdentity(file,{...identity,recipientIdentifier:'different-public-subject'})).rejects.toThrow('conflicts');expect(await new FileCustodyIdentities(file).list()).toEqual({ok:true,value:{items:[identity]}});}finally{await rm(root,{recursive:true,force:true});}
});

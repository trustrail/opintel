import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {it,expect,vi,afterEach} from 'vitest';
import {ProjectId} from '../src/shared/kernel/index.js';
import {ProjectHealth,projectHealthOpenApiDocument} from '../src/shared/api/project-health.js';
import {projectHealth,type HealthFacts} from '../src/modules/tenancy/application/project-health.js';
import {PostgresProjectHealthReader,deploymentTls} from '../src/modules/tenancy/infrastructure/project-health.js';
import {projectHealthRoutes} from '../src/modules/tenancy/api/project-health-routes.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import {allowBulk} from './fixtures/bulk-entitlements/fixture.js';
import {withTenant} from '../src/platform/db/scope.js';
import {createHttpServer} from '../src/platform/http/index.js';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
const at='2026-10-29T12:00:00.000Z';
const facts=():HealthFacts=>({engines:[{health:'healthy',at}],sources:[{status:'connected',at}],custody:{available:true,reason:null,checkedAt:at,dashboard:'authenticated',isXq:true},tls:{selfSignedTls:false,at},tokenKey:{backupAt:at,rehearsedAt:at,rehearsal:'ok'}});
it('HEALTH-001: uniform five-kind contract composes saved checks, omits mail, and never claims TLS expiry checks',()=>{
 const items=ProjectHealth.parse(projectHealth(ProjectId(randomUUID()),facts())).items;
 expect(items.map(i=>i.kind)).toEqual(['engine','sources','custody','tls','token_key']);
 expect(items.every(i=>i.status==='ok'&&i.checked_at===at&&i.next_action===null)).toBe(true);
 expect(items.find(i=>i.kind==='tls')?.reason).toContain('expiry is not checked');
 expect(Object.keys(items[0]!)).toEqual(['kind','status','checked_at','reason','next_action']);
 expect(projectHealthOpenApiDocument().paths['/api/v1/projects/{id}/health'].get['x-permission']).toBe('project#view');
});
it('HEALTH-002: actionable findings warn; only unavailable checks remain unknown',()=>{
 const f=facts();f.engines=[];f.sources=[];f.tls=null;f.tokenKey=null;f.custody={...f.custody,available:false,reason:'provider_configuration_changed'};
 const missing=projectHealth(ProjectId(randomUUID()),f).items;expect(missing.map(i=>i.status)).toEqual(['warning','warning','warning','unknown','warning']);
 for(const health of ['unavailable','contract_mismatch','unverified'] as const){f.engines=[{health,at}];expect(projectHealth(ProjectId(randomUUID()),f).items[0]?.status).toBe('warning');}
 f.sources=[{status:'unreachable',at}];f.custody={...f.custody,available:false,reason:'provider_check_failed'};f.tokenKey={backupAt:at,rehearsedAt:at,rehearsal:'mismatch'};f.tls={selfSignedTls:true,at};
 expect(projectHealth(ProjectId(randomUUID()),f).items.every(i=>i.status==='warning')).toBe(true);
 f.custody={...f.custody,reason:'check_unavailable'};expect(projectHealth(ProjectId(randomUUID()),f).items.find(i=>i.kind==='custody')?.status).toBe('unknown');
});
it('HEALTH-003: TLS reads only the deployment flag with a bounded request; unavailable or invalid flags stay unknown',async()=>{
 vi.stubEnv('APP_BASE_URL','https://console.example.test');
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({selfSignedTls:true})});vi.stubGlobal('fetch',fetcher);
 expect(await deploymentTls()).toMatchObject({selfSignedTls:true,at:expect.any(String)});
 expect(fetcher.mock.calls[0]?.[0].href).toBe('https://console.example.test/deployment.json');
 expect(fetcher.mock.calls[0]?.[1]).toMatchObject({redirect:'error',signal:expect.any(AbortSignal)});
 fetcher.mockResolvedValueOnce({ok:true,json:async()=>({certificate:'invented'})});expect(await deploymentTls()).toBeNull();
 fetcher.mockRejectedValueOnce(new Error('offline'));expect(await deploymentTls()).toBeNull();
});
it('HEALTH-004: real projection is project-isolated, non-mutating, authenticated and permissioned',async()=>{
 const f=await policyFixture(2),other=await policyFixture(1),reader=new PostgresProjectHealthReader(async()=>({selfSignedTls:true,at}));
 await withTenant(other.ctx,tx=>tx.query("UPDATE data_source SET status='unreachable' WHERE id=$1",[other.source]));
 const initial=unwrap(await reader.read(f.ctx));expect(initial.items.find(i=>i.kind==='sources')?.status).toBe('warning');expect(initial.items.find(i=>i.kind==='sources')?.checked_at).toBeNull();
 await withTenant(f.ctx,tx=>tx.query("UPDATE data_source SET status='unreachable' WHERE id=$1",[f.source]));
 expect(unwrap(await reader.read(f.ctx)).items.find(i=>i.kind==='sources')?.status).toBe('warning');
 let allowed=true,authenticated=true;const port={...allowBulk,check:async(...args:Parameters<typeof allowBulk.check>)=>({...await allowBulk.check(...args),allowed})};
 const server=createHttpServer(projectHealthRoutes(reader),{authorization:{port,currentUser:async()=>authenticated?f.actor:null}});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('Missing listener');
 const url=`http://127.0.0.1:${address.port}/api/v1/projects/${f.ctx.projectId}/health`;
 try{const response=await fetch(url);expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toBe('no-store');const result=ProjectHealth.parse(await response.json());expect(JSON.stringify(result)).not.toMatch(/credential_ref|secret:\/\/|certificatePin|tokenKeyVersion|bulk@example/);allowed=false;expect((await fetch(url)).status).toBe(404);authenticated=false;expect((await fetch(url)).status).toBe(401);}finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

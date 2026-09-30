import {PostgresMagicLinkAccess} from '../src/modules/identity/infrastructure/magic-link-access.js';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {it,expect,vi} from 'vitest';
import {withPlatform} from '../src/platform/db/scope.js';
import {createRedisConnection} from '../src/platform/redis/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {SystemClock,UuidV7IdFactory,SessionId} from '../src/shared/kernel/index.js';
import {createOidcRuntime} from '../src/modules/identity/infrastructure/oidc-runtime.js';
import {OpenIdClientAdapter} from '../src/modules/identity/infrastructure/openid-client-adapter.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {RedisSessionStore} from '../src/modules/identity/infrastructure/redis-session-store.js';
import {oidcRoutes} from '../src/modules/identity/api/oidc-routes.js';
import {CurrentUserService} from '../src/modules/identity/index.js';

it('1.9 reachability: production OIDC factory completes start/callback HTTP routes into a readable session',async()=>{
 const clock=new SystemClock(),redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();
 const identity=new PostgresIdentityRepository(clock),sessions=new RedisSessionStore(redis.client,clock,new UuidV7IdFactory());
 const email=randomUUID()+'@example.com';
 const [company]=await withPlatform(tx=>tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('OIDC route test','eu-west-1') RETURNING id"));
 await withPlatform(tx=>tx.query("INSERT INTO company_idp(company_id,provider,display_name,issuer,client_id,client_secret_ref) VALUES($1,'oidc:generic','SSO','https://idp.example','client','secret://test')",[company!.id]));
 const account=await identity.create(email,null);
 const authorize=vi.spyOn(OpenIdClientAdapter.prototype,'authorizationUrl').mockImplementation(async(_c,state)=>`https://idp.example/authorize?state=${state}`);
 const exchange=vi.spyOn(OpenIdClientAdapter.prototype,'exchange').mockResolvedValue({subject:randomUUID(),email,emailVerified:true});
 const server=createHttpServer(oidcRoutes(createOidcRuntime(redis.client,identity,identity,sessions,clock),'https://console.example'));
 server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address();if(!address||typeof address==='string')throw new Error('No address');const base=`http://127.0.0.1:${address.port}`;
 try{
  const start=await fetch(base+`/auth/oidc/oidc:generic/start?companyId=${company!.id}&deviceNonce=browser-nonce`,{redirect:'manual'});expect(start.status).toBe(302);
  expect(authorize).toHaveBeenCalledWith(expect.anything(),expect.any(String),expect.objectContaining({deviceNonce:'browser-nonce'}));
  const state=new URL(start.headers.get('location')!).searchParams.get('state')!;
  const cookie=start.headers.get('set-cookie')!.split(';')[0]!;
  const callback=base+`/auth/oidc/oidc:generic/callback?state=${state}&code=ok`;
  expect((await fetch(callback,{redirect:'manual'})).status).toBe(401);expect(exchange).not.toHaveBeenCalled();
  const completed=await fetch(callback,{headers:{cookie},redirect:'manual'});expect(completed.status,JSON.stringify({body:await completed.clone().text(),exchanges:exchange.mock.calls.length})).toBe(302);expect(completed.headers.get('location')).toBe('https://console.example/projects');
  const session=SessionId(completed.headers.get('set-cookie')!.split(';')[0]!.split('=')[1]!);
  expect(await new CurrentUserService(sessions,identity,new PostgresMagicLinkAccess()).read(session)).toMatchObject({id:account.id,method:'oidc:generic'});
  expect((await fetch(callback,{headers:{cookie},redirect:'manual'})).status).toBe(401);
  await sessions.revoke(session);
  const root=await readFile('src/platform/http/start.ts','utf8');expect(root).toContain('const oidc=createOidcRuntime(');expect(root).toContain('...oidcRoutes(oidc,');
  expect(await readFile('vite.config.ts','utf8')).toContain("'/auth/oidc':");
 }finally{authorize.mockRestore();exchange.mockRestore();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));await redis.close();await withPlatform(tx=>tx.query('DELETE FROM company WHERE id=$1',[company!.id]));}
});

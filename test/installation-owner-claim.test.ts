import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {Client} from 'pg';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withPlatform,withPlatformAdmin} from '../src/platform/db/scope.js';
import {SystemClock,UuidV7IdFactory,type InstallationClaimId} from '../src/shared/kernel/index.js';
import {InstallationClaimAdmission,PostgresInstallationClaimRepository,PostgresInstallationClaimWriter,RelationshipOutbox} from '../src/modules/tenancy/index.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import {MagicLinkService} from '../src/modules/identity/application/magic-link.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {PostgresMagicLinkAccess} from '../src/modules/identity/infrastructure/magic-link-access.js';
import {RedisSessionStore} from '../src/modules/identity/infrastructure/redis-session-store.js';
import {createRedisConnection,type RedisConnection} from '../src/platform/redis/index.js';

resetDatabaseBeforeEach('company','user_account','relationship_outbox','mail_outbox');
const clock=new SystemClock(),writer=new PostgresInstallationClaimWriter();
const input={claimant:{kind:'email' as const,email:'owner@example.com'},company:{name:'New client',defaultRegion:'eu-west-1' as const,defaultIndustryId:null}};
let redis:RedisConnection,sessions:RedisSessionStore,service:MagicLinkService,admission:InstallationClaimAdmission,authorization:AuthorizationPort;
beforeEach(async()=>{
 redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();
 sessions=new RedisSessionStore(redis.client,clock,new UuidV7IdFactory());
 const outbox=new RelationshipOutbox(),identity=new PostgresIdentityRepository(clock);
 authorization={check:async()=>({allowed:true,checkedAt:clock.now(),token:'test' as AuthorizationRevision,snapshotAgeMs:0}),checkMany:async()=>[],write:async()=> 'test' as AuthorizationRevision,explain:async()=>({allowed:true,path:[]})};
 admission=new InstallationClaimAdmission(new PostgresInstallationClaimRepository(outbox),outbox,authorization);
 service=new MagicLinkService(identity,identity,identity,{check:async()=>({allowed:true,retryAfterSeconds:0})},sessions,clock,new PostgresMagicLinkAccess(),undefined,admission);
});
afterEach(async()=>{await redis?.close();});
async function claim(){const result=await writer.create(input);if(!result.ok)throw result.error;return result.value;}
async function token(email=input.claimant.email){const result=await service.requestLink({email,deviceNonce:'owner-browser',ip:'192.0.2.1'});if(!result.token)throw new Error('Expected normal login delivery');return result.token;}
const callback=(value:string)=>({token:value,deviceNonce:'owner-browser',ip:'192.0.2.1',userAgent:'claim-test'});
async function expire(id:InstallationClaimId){
 // Fixture time travel uses the isolated database owner, never runtime grants.
 const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
 try{await db.query("WITH tick AS (SELECT clock_timestamp() AS at) UPDATE installation_owner_claim SET created_at=tick.at-interval '25 hours',expires_at=tick.at-interval '1 hour' FROM tick WHERE id=$1",[id]);}finally{await db.end();}
}
async function counts(){return withPlatform(async tx=>{
 const [row]=await tx.query<{companies:number;users:number;members:number}>('SELECT (SELECT count(*)::int FROM company) companies,(SELECT count(*)::int FROM user_account) users,(SELECT count(*)::int FROM company_member) members');return row;
});}

it('DEP-008: gateway CLI records only a 24-hour claim and audit, with no account or administrator grant',async()=>{
 const output=execFileSync(process.execPath,['--import','tsx','src/platform/ops/owner-claim.ts','--owner-email',input.claimant.email,'--company',input.company.name,'--region',input.company.defaultRegion],{env:{...process.env,OPINTEL_DEPLOYMENT_PACKAGE:'gateway'},encoding:'utf8'});
 expect(output).toMatch(/Owner claim .* expires at/);expect(output).not.toContain(process.env.DATABASE_URL!);
 expect(await counts()).toEqual({companies:0,users:0,members:0});
 const [stored]=await withPlatform(tx=>tx.query<{claimant:unknown;hours:number}>('SELECT claimant,extract(epoch FROM expires_at-created_at)/3600 AS hours FROM installation_owner_claim'));
 expect(stored?.claimant).toEqual(input.claimant);expect(Number(stored?.hours)).toBe(24);
 expect(await withPlatform(tx=>tx.query("SELECT action FROM audit_entry WHERE action='InstallationOwnerClaimCreated'"))).toHaveLength(1);
});
it('DEP-008: only the exact owner email can complete normal login and redeem once',async()=>{
 const issued=await claim();
 expect((await service.requestLink({email:'different@example.com',deviceNonce:'other',ip:'192.0.2.2'})).token).toBeNull();
 const value=await token();
 expect(await counts()).toEqual({companies:0,users:0,members:0});
 const results=await Promise.all([service.callback(callback(value)),service.callback(callback(value))]);
 expect(results.filter(r=>r.kind==='session')).toHaveLength(1);
 expect(results.filter(r=>r.kind==='invalid')).toHaveLength(1);
 expect(await counts()).toEqual({companies:1,users:1,members:1});
 const [row]=await withPlatform(tx=>tx.query<{redeemed_at:Date|null;email:string;role:string}>("SELECT c.redeemed_at,u.email,m.role FROM installation_owner_claim c JOIN user_account u ON u.id=c.redeemed_by JOIN company_member m ON m.company_id=c.company_id AND m.user_id=u.id WHERE c.id=$1",[issued.id]));
 expect(row).toMatchObject({email:input.claimant.email,role:'admin'});expect(row?.redeemed_at).not.toBeNull();
 expect(await withPlatform(tx=>tx.query("SELECT action FROM audit_entry WHERE action='InstallationOwnerClaimRedeemed'"))).toHaveLength(1);
 expect((await writer.create(input)).ok).toBe(false);
});
it('DEP-008: expiry refuses a previously issued login, preserves the claim, and needs an explicit fresh claim',async()=>{
 const first=await claim(),value=await token();await expire(first.id);
 expect(await service.callback(callback(value))).toEqual({kind:'invalid'});
 expect(await counts()).toEqual({companies:0,users:0,members:0});
 expect((await service.requestLink({email:input.claimant.email,deviceNonce:'owner-browser',ip:'192.0.2.1'})).token).toBeNull();
 const second=await claim();expect(second.id).not.toBe(first.id);
 expect(await withPlatform(tx=>tx.query('SELECT id FROM installation_owner_claim'))).toHaveLength(2);
 expect((await service.callback(callback(await token()))).kind).toBe('session');
});
it('DEP-008: expiry after session preparation revokes that session and leaves no account or role',async()=>{
 const issued=await claim(),value=await token(),create=vi.spyOn(sessions,'create');
 const redeem=admission.redeem.bind(admission);
 vi.spyOn(admission,'redeem').mockImplementation(async login=>{await expire(issued.id);return redeem(login);});
 expect(await service.callback(callback(value))).toEqual({kind:'invalid'});
 const prepared=await create.mock.results[0]!.value;
 expect(await sessions.read(prepared)).toBeNull();expect(await counts()).toEqual({companies:0,users:0,members:0});
});
it('DEP-008: concurrent operators cannot replace an active claim and ordinary runtime cannot issue one',async()=>{
 const results=await Promise.all([writer.create(input),writer.create({...input,claimant:{kind:'email',email:'other@example.com'}})]);
 expect(results.filter(r=>r.ok)).toHaveLength(1);
 await expect(withPlatform(tx=>tx.query('INSERT INTO installation_owner_claim(claimant,company) VALUES($1,$2)',[input.claimant,input.company]))).rejects.toThrow();
 expect(await withPlatform(tx=>tx.query('SELECT id FROM installation_owner_claim'))).toHaveLength(1);
});
it('DEP-008: any existing company prevents creation and redemption without granting access to it',async()=>{
 const issued=await claim(),value=await token();
 await withPlatformAdmin({actor:{kind:'system',name:'claim-test'}},tx=>tx.query("INSERT INTO company(id,name,default_region) VALUES($1,'Existing','eu-west-1')",[randomUUID()]));
 expect((await writer.create(input)).ok).toBe(false);
 expect(await service.callback(callback(value))).toEqual({kind:'invalid'});
 expect(await counts()).toEqual({companies:1,users:0,members:0});
 const [row]=await withPlatform(tx=>tx.query<{redeemed_at:Date|null}>('SELECT redeemed_at FROM installation_owner_claim WHERE id=$1',[issued.id]));expect(row?.redeemed_at).toBeNull();
});
it('DEP-008: authorization outage retains the durable grant while normal identity login completes',async()=>{
 await claim();const write=vi.spyOn(authorization,'write').mockRejectedValue(new Error('synthetic outage'));
 expect((await service.callback(callback(await token()))).kind).toBe('session');
 const [row]=await withPlatform(tx=>tx.query<{written_at:Date|null;attempts:number}>('SELECT written_at,attempts FROM relationship_outbox'));
 expect(row?.written_at).toBeNull();expect(row?.attempts).toBeGreaterThan(0);
 write.mockResolvedValue('recovered' as AuthorizationRevision);await admission.reconcile();
 const [delivered]=await withPlatform(tx=>tx.query<{written_at:Date|null}>('SELECT written_at FROM relationship_outbox'));
 expect(delivered?.written_at).not.toBeNull();
});

import {randomUUID} from 'node:crypto';
import {Client} from 'pg';
import {expect,it,vi} from 'vitest';
import {queryFixture} from './fixtures/query/fixture.js';
import {CredentialId,PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,PostgresPoolReader} from '../src/modules/pools/index.js';
import {LocalReleaseProvider,PostgresGrantSignatures} from '../src/modules/release-custody/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {ok,type Result} from '../src/shared/kernel/index.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {PoolKeyCreationResponse} from '../src/shared/api/pool-keys.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
function keys(f:Awaited<ReturnType<typeof queryFixture>>){return new PoolKeyService(new PostgresPoolKeys(undefined,(ctx,alias)=>f.release!.provision(ctx,alias),f.release),{affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})});}
function revoke(f:Awaited<ReturnType<typeof queryFixture>>,count:number){return keys(f).execute(f.ctx,{kind:'revokeCredential',poolId:f.pool,credentialId:CredentialId(f.issued.credentialId!),confirmation:'Query pool',confirmedLiveGrants:count},randomUUID());}

it('credential revocation is local during provider outage; current, legacy and released-share grants remain durably pending and are cleaned later',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true}),owner=new Client({connectionString:process.env.TEST_DATABASE_URL});await owner.connect();
 try{
  const rotated=PoolKeyCreationResponse.parse(unwrap(await keys(f).execute(f.ctx,{kind:'rotate',poolId:f.pool,credentialId:CredentialId(f.issued.credentialId!)},randomUUID())));if(!rotated.keyShown)throw new Error('Missing key');
  const legacy=`agent:${f.ctx.projectId}:${randomUUID()}`;await f.release!.provision(f.ctx,legacy);
  // Reproduce the migrated retiring-alias state, as in pool-credentials.test.
  await owner.query('BEGIN');try{await owner.query('ALTER TABLE pool_key DISABLE TRIGGER pool_key_custody_alias');await owner.query('UPDATE pool_key SET custody_alias=$2 WHERE id=$1',[f.issued.keyVersion,legacy]);await owner.query('ALTER TABLE pool_key ENABLE TRIGGER pool_key_custody_alias');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  const current=await f.connect(rotated.key);
  const legacyAnswer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
  const currentAnswer=QueryOutput.parse((await current.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
  const released=QueryOutput.parse((await current.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
  const cleaned=QueryOutput.parse((await current.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
  expect(await current.client.callTool({name:'opintel.redeem',arguments:{grant:cleaned.custody![0]!.grant}})).not.toHaveProperty('isError',true);
  const claims=JSON.parse(Buffer.from(cleaned.custody![0]!.grant.split('.')[1]!,'base64url').toString()) as {custody:{provider_redeem_at:string}};
  const fetched=await fetch(claims.custody.provider_redeem_at,{method:'POST',headers:{authorization:`Bearer ${rotated.key}`,'content-type':'application/json','x-opintel-agent-id':'revocation-test'},body:JSON.stringify({grant:cleaned.custody![0]!.grant})});expect(fetched.status).toBe(200);await fetched.body?.cancel();
  await f.release!.sweep();
  expect(await current.client.callTool({name:'opintel.redeem',arguments:{grant:released.custody![0]!.grant}})).not.toHaveProperty('isError',true);
  const remote=vi.spyOn(LocalReleaseProvider.prototype,'revoke').mockRejectedValue(new Error('Provider unreachable'));
  expect(unwrap(await revoke(f,4))).toMatchObject({state:'revoked'});expect(remote).not.toHaveBeenCalled();
  expect(unwrap(await new PostgresPoolReader().detail(f.ctx,f.pool)).credentials).toEqual(expect.arrayContaining([expect.objectContaining({id:f.issued.credentialId,state:'revoked',pendingCleanupCount:3})]));
  const verifier=new PostgresKeyVerifier();expect(await verifier.verify(f.issued.key)).toEqual({ok:false,reason:'revoked'});expect(await verifier.verify(rotated.key)).toEqual({ok:false,reason:'revoked'});
  const rows=()=>withTenant(f.ctx,tx=>tx.query<{receipt_id:string;share:null;state:string;escrow_revoked:boolean}>('SELECT receipt_id,share,state,escrow_revoked FROM release_grant ORDER BY receipt_id'));
  expect(await rows()).toEqual(expect.arrayContaining([
   {receipt_id:legacyAnswer.evidenceId,share:null,state:'revoked',escrow_revoked:false},
   {receipt_id:currentAnswer.evidenceId,share:null,state:'revoked',escrow_revoked:false},
   {receipt_id:released.evidenceId,share:null,state:'redeemed',escrow_revoked:false},
   {receipt_id:cleaned.evidenceId,share:null,state:'redeemed',escrow_revoked:true},
  ]));
  for(const answer of [legacyAnswer,currentAnswer,released])expect(await f.release!.redeem(f.ctx,answer.custody![0]!.grant,answer===legacyAnswer?legacy:f.issued.custodyAlias!,null)).toMatchObject({ok:false});
  await f.release!.sweep();expect((await rows()).every(r=>r.escrow_revoked===(r.receipt_id===cleaned.evidenceId)&&r.share===null)).toBe(true);expect(remote).toHaveBeenCalled();
  remote.mockRestore();await f.release!.sweep();expect((await rows()).every(r=>r.escrow_revoked&&r.share===null)).toBe(true);
  expect(unwrap(await new PostgresPoolReader().detail(f.ctx,f.pool)).credentials).toEqual(expect.arrayContaining([expect.objectContaining({id:f.issued.credentialId,pendingCleanupCount:0})]));
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT kind FROM release_event WHERE kind=\'revoked\''))).toHaveLength(4);
 }finally{vi.restoreAllMocks();await owner.end();await f.close();}
},60000);

it('escrow completing after credential revocation cannot issue a grant; its pending cleanup survives provider failure',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});let releaseEscrow=()=>{};
 try{
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  let entered=()=>{};const started=new Promise<void>(r=>{entered=r;}),hold=new Promise<void>(r=>{releaseEscrow=r;});
  const original=LocalReleaseProvider.prototype.escrow;
  vi.spyOn(LocalReleaseProvider.prototype,'escrow').mockImplementation(async function(this:LocalReleaseProvider,...args:Parameters<typeof original>){const locator=await original.apply(this,args);entered();await hold;return locator;});
  const remote=vi.spyOn(LocalReleaseProvider.prototype,'revoke').mockRejectedValue(new Error('Provider unreachable'));
  const query=f.query('SELECT field_1 FROM warehouse.public.records');await started;
  expect(unwrap(await revoke(f,0))).toMatchObject({state:'revoked'});releaseEscrow();
  const result=await query;expect(result).toMatchObject({isError:true});expect(result).not.toHaveProperty('structuredContent');
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT state,share,escrow_revoked FROM release_grant'))).toEqual([{state:'revoked',share:null,escrow_revoked:false}]);
  expect(await withTenant(f.ctx,tx=>tx.query("SELECT kind FROM release_event WHERE kind='granted'"))).toEqual([]);
  expect(remote).not.toHaveBeenCalled();await f.release!.sweep();expect(remote).toHaveBeenCalled();
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT escrow_revoked FROM release_grant'))).toEqual([{escrow_revoked:false}]);
  remote.mockRestore();await f.release!.sweep();expect(await withTenant(f.ctx,tx=>tx.query('SELECT escrow_revoked FROM release_grant'))).toEqual([{escrow_revoked:true}]);
 }finally{releaseEscrow();vi.restoreAllMocks();await f.close();}
},60000);

it('an authenticated K2 redemption paused before the release lock is refused after credential revocation',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});let resume=()=>{};
 try{
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent);
  let entered=()=>{};const started=new Promise<void>(r=>{entered=r;}),hold=new Promise<void>(r=>{resume=r;});
  const original=PostgresGrantSignatures.prototype.verify;
  vi.spyOn(PostgresGrantSignatures.prototype,'verify').mockImplementation(async function(this:PostgresGrantSignatures,...args:Parameters<typeof original>){const checked=await original.apply(this,args);entered();await hold;return checked;});
  const pending=f.release!.redeem(f.ctx,answer.custody![0]!.grant,f.issued.custodyAlias!,null);await started;
  unwrap(await revoke(f,1));resume();expect(await pending).toMatchObject({ok:false,error:{code:'forbidden'}});
  expect(await withTenant(f.ctx,tx=>tx.query("SELECT kind FROM release_event WHERE kind='redeemed'"))).toEqual([]);
 }finally{resume();vi.restoreAllMocks();await f.close();}
},60000);

import {sealResult} from '../src/shared/infrastructure/sealed-result.js';
import {Client} from 'pg';
import {randomUUID} from 'node:crypto';
import {expect,it,vi} from 'vitest';
import {CredentialId,PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,poolKeyId} from '../src/modules/pools/index.js';
import {PoolKeyCreationResponse} from '../src/shared/api/pool-keys.js';
import {PoolId,RunId,ok,type Result} from '../src/shared/kernel/index.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {bulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {queryFixture} from './fixtures/query/fixture.js';
import {QueryOutput} from '../src/shared/api/mcp.js';
import {PostgresEvidenceWriter,PostgresEvidenceReader} from '../src/modules/evidence/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
async function fixture(){
 const f=await bulkFixture(0);await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const provision=vi.fn(async()=>{}),repository=new PostgresPoolKeys(undefined,provision),presence={affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})},service=new PoolKeyService(repository,presence);
 const first=PoolKeyCreationResponse.parse(unwrap(await service.execute(f.ctx,{kind:'create',name:'One pool'},randomUUID())));if(!first.keyShown||!first.credentialId)throw new Error('Missing initial credential');
 return {...f,first,poolId:PoolId(first.poolId),service,provision};
}
it('5.37 step 1: independent credentials, stable aliases, per-credential slots, key revocation versus identity revocation',async()=>{
 const f=await fixture(),verifier=new PostgresKeyVerifier();
 const second=PoolKeyCreationResponse.parse(unwrap(await f.service.execute(f.ctx,{kind:'issue',poolId:f.poolId,label:'Agent two'},randomUUID())));if(!second.keyShown||!second.credentialId)throw new Error('Missing second credential');
 expect(second.custodyAlias).not.toBe(f.first.custodyAlias);
 expect(await f.service.execute(f.ctx,{kind:'rotate',poolId:f.poolId},randomUUID())).toMatchObject({ok:false,error:{code:'validation_failed'}});
 const rotate=async(id:string)=>PoolKeyCreationResponse.parse(unwrap(await f.service.execute(f.ctx,{kind:'rotate',poolId:f.poolId,credentialId:CredentialId(id)},randomUUID())));
 const a=await rotate(f.first.credentialId!),b=await rotate(second.credentialId);if(!a.keyShown||!b.keyShown)throw new Error('Missing rotated keys');
 expect(a.custodyAlias).toBe(f.first.custodyAlias);expect(b.custodyAlias).toBe(second.custodyAlias);expect(f.provision).toHaveBeenCalledTimes(2);
 expect(await withTenant(f.ctx,tx=>tx.query('SELECT credential_id,state FROM pool_key WHERE pool_id=$1',[f.poolId]))).toHaveLength(4);
 unwrap(await f.service.execute(f.ctx,{kind:'revoke',poolId:f.poolId,keyVersion:unwrap(poolKeyId(f.first.keyVersion)),confirmation:'One pool'},randomUUID()));
 expect(await verifier.verify(a.key)).toMatchObject({ok:true,credentialId:f.first.credentialId,custodyAlias:f.first.custodyAlias});
 unwrap(await f.service.execute(f.ctx,{kind:'revokeCredential',poolId:f.poolId,credentialId:CredentialId(second.credentialId),confirmation:'Agent two'},randomUUID()));
 expect(await verifier.verify(second.key)).toEqual({ok:false,reason:'revoked'});expect(await verifier.verify(b.key)).toEqual({ok:false,reason:'revoked'});expect(await verifier.verify(a.key)).toMatchObject({ok:true});
 expect(await f.service.execute(f.ctx,{kind:'rotate',poolId:f.poolId,credentialId:CredentialId(second.credentialId)},randomUUID())).toMatchObject({ok:false,error:{code:'conflict'}});
},30_000);
it('5.37 step 1: same-pool credentials cannot redeem each other; receipts snapshot credential and alias; revocation confirms and clears grants',async()=>{
 const writer=new PostgresEvidenceWriter(),f=await queryFixture(writer,{releaseCustody:true});
 try{
  const keys=new PoolKeyService(new PostgresPoolKeys(undefined,(ctx,alias)=>f.release!.provision(ctx,alias),f.release),{affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})});
  const other=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'issue',poolId:f.pool,label:'Second agent'},randomUUID())));if(!other.keyShown)throw new Error('Missing credential');
  const connection=await f.connect(other.key);
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  const answer=QueryOutput.parse((await f.query('SELECT field_1 FROM warehouse.public.records')).structuredContent),grant=answer.custody![0]!.grant;
  expect(await connection.client.callTool({name:'opintel.redeem',arguments:{grant}})).toMatchObject({isError:true});
  const claims=JSON.parse(Buffer.from(grant.split('.')[1]!,'base64url').toString()) as {custody:{provider_redeem_at:string}};
  const denied=await fetch(claims.custody.provider_redeem_at,{method:'POST',headers:{authorization:`Bearer ${other.key}`,'content-type':'application/json','x-opintel-agent-id':'second'},body:JSON.stringify({grant})});expect(denied.status).toBe(403);
  const secondAnswer=QueryOutput.parse((await connection.client.callTool({name:'opintel.query',arguments:{sql:'SELECT field_1 FROM warehouse.public.records'}})).structuredContent);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT credential_id,custody_alias FROM query_run WHERE id=$1',[secondAnswer.evidenceId]))).toEqual([{credential_id:other.credentialId,custody_alias:other.custodyAlias}]);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT last_used_at IS NOT NULL AS used FROM pool_credential WHERE id=$1',[other.credentialId]))).toEqual([{used:true}]);
  const [opened]=await withTenant(f.ctx,tx=>tx.query<{at:string}>('SELECT started_at::text AS at FROM query_run WHERE id=$1',[answer.evidenceId]));
  expect(unwrap(await new PostgresEvidenceReader().detail(f.ctx,RunId(answer.evidenceId),opened!.at))).toMatchObject({credentialId:f.issued.credentialId,custodyAlias:f.issued.custodyAlias});
  const [receipt]=await withTenant(f.ctx,tx=>tx.query('SELECT credential_id,custody_alias FROM query_run WHERE id=$1',[answer.evidenceId]));expect(receipt).toEqual({credential_id:f.issued.credentialId,custody_alias:f.issued.custodyAlias});
  const command={kind:'revokeCredential' as const,poolId:f.pool,credentialId:CredentialId(f.issued.credentialId!),confirmation:'Query pool'};
  const refusal=await keys.execute(f.ctx,command,randomUUID());expect(refusal).toMatchObject({ok:false,error:{code:'conflict',details:{liveGrantCount:1}}});
  unwrap(await keys.execute(f.ctx,{...command,confirmedLiveGrants:1},randomUUID()));
  await expect(f.client.callTool({name:'opintel.redeem',arguments:{grant}})).rejects.toThrow('unauthenticated');
  const [stored]=await withTenant(f.ctx,tx=>tx.query('SELECT share,state,escrow_revoked FROM release_grant WHERE receipt_id=$1',[answer.evidenceId]));expect(stored).toEqual({share:null,state:'revoked',escrow_revoked:true});
  expect(await new PostgresKeyVerifier().verify(other.key)).toMatchObject({ok:true});
 }finally{await f.close();}
},60_000);

it('5.37 step 1: a migrated retiring alias loses outstanding escrow at grace end; the permanent alias survives',async()=>{
 const f=await queryFixture(undefined,{releaseCustody:true});const owner=new Client({connectionString:process.env.TEST_DATABASE_URL});await owner.connect();
 try{
  const keys=new PoolKeyService(new PostgresPoolKeys(undefined,(ctx,alias)=>f.release!.provision(ctx,alias),f.release),{affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})});
  unwrap(await keys.execute(f.ctx,{kind:'rotate',poolId:f.pool,credentialId:CredentialId(f.issued.credentialId!)},randomUUID()));
  const legacy=`agent:${f.ctx.projectId}:${randomUUID()}`;await f.release!.provision(f.ctx,legacy);
  // Seed exactly the pre-migration legacy state. The owner-only trigger toggle
  // is transaction-local setup; ordinary callers cannot rewrite an alias.
  await owner.query('BEGIN');
  try{await owner.query('ALTER TABLE pool_key DISABLE TRIGGER pool_key_custody_alias');await owner.query("UPDATE pool_key SET custody_alias=$2,created_at=now()-interval '2 hours',grace_until=now()+interval '1 hour' WHERE id=$1",[f.issued.keyVersion,legacy]);await owner.query('ALTER TABLE pool_key ENABLE TRIGGER pool_key_custody_alias');await owner.query('COMMIT');}catch(error){await owner.query('ROLLBACK');throw error;}
  const receipt=randomUUID(),sealed=sealResult([['sealed test']],['value'],[0],receipt);
  let result;
  try{result=unwrap(await f.release!.seal(f.ctx,legacy,receipt,['value'],sealed.rows,[0],{first:sealed.first.toString('base64url'),second:sealed.second.toString('base64url')}));}finally{sealed.first.fill(0);sealed.second.fill(0);}
  expect(result.custody).toHaveLength(1);
  await f.release!.sweep();expect(await withTenant(f.ctx,tx=>tx.query('SELECT state FROM release_grant WHERE receipt_id=$1',[receipt]))).toEqual([{state:'granted'}]);
  await withTenant(f.ctx,tx=>tx.query("UPDATE pool_key SET grace_until=now()-interval '1 minute' WHERE id=$1",[f.issued.keyVersion]));await f.release!.sweep();
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT share,state,escrow_revoked FROM release_grant WHERE receipt_id=$1',[receipt]))).toEqual([{share:null,state:'revoked',escrow_revoked:true}]);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT alias_retired_at IS NOT NULL AS retired FROM pool_key WHERE id=$1',[f.issued.keyVersion]))).toEqual([{retired:true}]);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT custody_alias,revoked_at FROM pool_credential WHERE id=$1',[f.issued.credentialId]))).toEqual([{custody_alias:f.issued.custodyAlias,revoked_at:null}]);
 }finally{await owner.end();await f.close();}
},60_000);

it('5.37 step 1: an empty credential can be revoked without inventing a key version',async()=>{
 const f=await fixture(),empty=CredentialId(randomUUID());
 await withTenant(f.ctx,tx=>tx.query("INSERT INTO pool_credential(id,pool_id,project_id,label,custody_alias) VALUES($1,$2,$3,'Not issued','filled by trigger')",[empty,f.poolId,f.ctx.projectId]));
 const result=unwrap(await f.service.execute(f.ctx,{kind:'revokeCredential',poolId:f.poolId,credentialId:empty,confirmation:'Not issued'},randomUUID()));
 expect(result).toEqual({poolId:f.poolId,credentialId:empty,label:'Not issued',custodyAlias:`agent:${f.ctx.projectId}:${empty}`,state:'revoked',keyShown:false});expect(result).not.toHaveProperty('keyVersion');
},30_000);

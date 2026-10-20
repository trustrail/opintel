import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import * as scopes from '../src/platform/db/scope.js';
import {bulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {PoolKeyService,PostgresPoolKeys,PostgresKeyVerifier,PostgresAgentPresence} from '../src/modules/pools/index.js';
import {PostgresMcpConfiguration,type McpPrincipal} from '../src/modules/mcp/index.js';
import {PoolKeyCreationResponse} from '../src/shared/api/pool-keys.js';
import type {Result} from '../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
afterEach(()=>vi.restoreAllMocks());
async function fixture(){
 const f=await bulkFixture(0);
 await scopes.withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,f.ctx.userId+'@example.com']));
 const created=PoolKeyCreationResponse.parse(unwrap(await new PoolKeyService(new PostgresPoolKeys(),new PostgresAgentPresence({publish:async()=>{}})).execute(f.ctx,{kind:'create',name:'Sweep fixture'},randomUUID())));
 if(!created.keyShown)throw new Error('Missing fixture key');
 const key=await new PostgresKeyVerifier().verify(created.key);if(!key.ok)throw new Error('Invalid fixture key');
 const principal:McpPrincipal={...key,agentId:'fixture'};
 return {...f,principal};
}
it('X05-SWEEP-001: twenty sessions in different projects use one fresh acquisition and one query',async()=>{
 const a=await fixture(),b=await fixture(),principals=Array.from({length:20},(_,i)=>({...((i%2?a:b).principal),agentId:'agent-'+i}));
 const original=scopes.withPlatform,sql:string[]=[];
 const spy=vi.spyOn(scopes,'withPlatform').mockImplementation(work=>original(tx=>work({query:<T>(statement:string,params?:readonly unknown[])=>{sql.push(statement);return tx.query<T>(statement,params);}})));
 const reader=new PostgresMcpConfiguration(),first=await reader.readMany(principals);
 expect(first).toHaveLength(20);expect(first.every(r=>r.ok&&r.value.heartbeatSeconds===20)).toBe(true);
 expect(spy).toHaveBeenCalledTimes(1);expect(sql).toHaveLength(1);
 spy.mockRestore();
 expect(await scopes.withTenant(a.ctx,tx=>tx.query('SELECT id FROM pool WHERE id=$1',[b.principal.pool.id]))).toEqual([]);
 await expect(scopes.withTenant(a.ctx,tx=>tx.query('SELECT * FROM public.read_mcp_session_states($1::uuid[])',[[b.principal.keyVersion]]))).rejects.toMatchObject({code:'42501'});
 await expect(scopes.withPlatform(tx=>tx.query('SELECT id FROM pool_key'))).rejects.toMatchObject({code:'42501'});
 await scopes.withTenant(a.ctx,tx=>tx.query("UPDATE pool_key SET state='revoked',grace_until=NULL WHERE id=$1",[a.principal.keyVersion]));
 const second=await reader.readMany(principals);
 for(let i=0;i<second.length;i++)expect(second[i]?.ok).toBe(i%2===0);
});
it('X05-SWEEP-002: credential revocation, archival, modes and timing are read again without a validity cache',async()=>{
 const a=await fixture(),b=await fixture(),reader=new PostgresMcpConfiguration();
 expect((await reader.readMany([a.principal,b.principal])).every(r=>r.ok)).toBe(true);
 await scopes.withTenant(a.ctx,tx=>tx.query('UPDATE pool_credential SET revoked_at=clock_timestamp() WHERE id=$1',[a.principal.credentialId]));
 await scopes.withTenant(b.ctx,tx=>tx.query('UPDATE pool SET mode_query=false WHERE id=$1',[b.principal.pool.id]));
 await scopes.withPlatform(tx=>tx.query("UPDATE project SET settings=$2 WHERE id=$1",[b.ctx.projectId,{agentHeartbeatSeconds:5,unrelated:'never returned'}]));
 expect(await reader.readMany([a.principal,b.principal])).toMatchObject([{ok:false,error:{code:'unauthenticated'}},{ok:true,value:{heartbeatSeconds:5,modes:{query:false}}}]);
 const raw=await scopes.withPlatform(tx=>tx.query<{settings:unknown}>('SELECT settings FROM public.read_mcp_session_states($1::uuid[])',[[b.principal.keyVersion]]));
 expect(raw[0]?.settings).toEqual({agentHeartbeatSeconds:5});
 await scopes.withPlatform(tx=>tx.query('UPDATE project SET archived_at=clock_timestamp() WHERE id=$1',[b.ctx.projectId]));
 expect(await reader.readMany([b.principal])).toMatchObject([{ok:false,error:{code:'unauthenticated'}}]);
});
it('X05-SWEEP-003: grace expiry, future keys, invalid timing and tuple mismatches fail independently',async()=>{
 const a=await fixture(),b=await fixture(),reader=new PostgresMcpConfiguration();
 await scopes.withTenant(a.ctx,tx=>tx.query("UPDATE pool_key SET state='retiring',grace_until=clock_timestamp()+interval '1 hour' WHERE id=$1",[a.principal.keyVersion]));
 expect((await reader.readMany([a.principal]))[0]?.ok).toBe(true);
 await scopes.withTenant(a.ctx,tx=>tx.query("UPDATE pool_key SET created_at=clock_timestamp()-interval '2 hours',grace_until=clock_timestamp()-interval '1 second' WHERE id=$1",[a.principal.keyVersion]));
 expect(await reader.readMany([a.principal,b.principal])).toMatchObject([{ok:false},{ok:true}]);
 await scopes.withTenant(b.ctx,tx=>tx.query("UPDATE pool_key SET created_at=clock_timestamp()+interval '1 hour' WHERE id=$1",[b.principal.keyVersion]));
 expect(await reader.readMany([b.principal])).toMatchObject([{ok:false}]);
 const c=await fixture();
 // The database rejects invalid timing settings. Inject a malformed adapter row
 // to verify boundary refusal without disabling that database constraint.
 const timing=vi.spyOn(scopes,'withPlatform').mockResolvedValueOnce([{key_version:c.principal.keyVersion,pool_id:c.principal.pool.id,project_id:c.ctx.projectId,credential_id:c.principal.credentialId,mode_query:true,mode_prompt:false,settings:{agentHeartbeatSeconds:0}}]);
 expect(await reader.readMany([c.principal])).toMatchObject([{ok:false,error:{code:'validation_failed'}}]);timing.mockRestore();
 expect(await reader.readMany([{...c.principal,pool:{...c.principal.pool,projectId:a.ctx.projectId}},{...c.principal,credentialId:a.principal.credentialId}])).toMatchObject([{ok:false,error:{code:'unauthenticated'}},{ok:false,error:{code:'unauthenticated'}}]);
});
it('an empty session sweep acquires nothing',async()=>{
 const spy=vi.spyOn(scopes,'withPlatform');expect(await new PostgresMcpConfiguration().readMany([])).toEqual([]);expect(spy).not.toHaveBeenCalled();
});

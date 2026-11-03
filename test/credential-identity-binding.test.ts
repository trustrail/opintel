import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {PostgresCredentialBindings,PostgresPoolKeys,PoolKeyService,CredentialId} from '../src/modules/pools/index.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {PoolKeyCreationResponse} from '../src/shared/api/pool-keys.js';
import {ok,type Result} from '../src/shared/kernel/index.js';
import {bulkFixture} from './fixtures/bulk-entitlements/fixture.js';
import {custodyCredentialGuard} from '../src/modules/entitlements/infrastructure/custody-credential-guard.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
const certificate={fingerprint:'a'.repeat(64),subject:'CN=Fixture'},other={fingerprint:'b'.repeat(64),subject:'CN=Other'};
const enrollment={certificateId:223,deviceName:'Self-declared label',recipientIdentifier:'fixture-recipient@example.invalid'};
async function fixture(kind:'identity-bound'|'bearer-only'='identity-bound'){
 const f=await bulkFixture(0);await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.invalid`]));
 const keys=new PoolKeyService(new PostgresPoolKeys(),{affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})});
 const issued=PoolKeyCreationResponse.parse(unwrap(await keys.execute(f.ctx,{kind:'issue',poolId:f.pool,label:'Fixture credential',credentialKind:kind},randomUUID())));const id=CredentialId(issued.credentialId!);
 const bindings=new PostgresCredentialBindings();
 const authenticate=(cert:typeof certificate|undefined=certificate,labels:typeof enrollment|undefined=enrollment)=>bindings.authenticate(f.ctx,f.pool,id,cert,labels);
 const row=()=>withTenant(f.ctx,async tx=>(await tx.query<{binding_status:string;certificate_fingerprint:string|null;recipient_identifier:string|null}>('SELECT * FROM pool_credential WHERE id=$1',[id]))[0]!);
 return {...f,id,bindings,keys,authenticate,row};
}
it('ID-01 first connection binds fingerprint and records audit; later certificates must match',async()=>{
 const f=await fixture();expect((await f.authenticate()).ok).toBe(true);expect(await f.row()).toMatchObject({binding_status:'bound',certificate_fingerprint:certificate.fingerprint,recipient_identifier:enrollment.recipientIdentifier});
 expect((await f.authenticate(certificate,undefined)).ok).toBe(true);
 const mismatch=await f.authenticate(other);expect(mismatch).toMatchObject({ok:false,error:{details:{cause:'identity_mismatch'}}});
 const events=await withTenant(f.ctx,tx=>tx.query<{action:string;after:{cause?:string}}>('SELECT action,after FROM audit_entry WHERE target->>\'credentialId\'=$1 ORDER BY occurred_at,id',[f.id]));
 expect(events.map(e=>e.action)).toContain('CredentialIdentityBound');expect(events.some(e=>e.action==='CredentialIdentityRefused'&&e.after.cause==='identity_mismatch')).toBe(true);
});
it('ID-01 missing client certificate is refused; bearer-only remains usable without one',async()=>{
 const f=await fixture();expect(await f.bindings.authenticate(f.ctx,f.pool,f.id,undefined,undefined)).toMatchObject({ok:false,error:{details:{cause:'identity_mismatch'}}});
 const bearer=await fixture('bearer-only');expect((await bearer.bindings.authenticate(bearer.ctx,bearer.pool,bearer.id,undefined,undefined)).ok).toBe(true);
 expect(await withTenant(bearer.ctx,tx=>custodyCredentialGuard(tx,bearer.pool))).toMatchObject({ok:false,error:{message:expect.stringContaining('Fixture credential')}});
});
it('ID-01 pending bindings serve nothing until approval; reset requires fresh enrollment and is audited',async()=>{
 const f=await fixture();await withTenant(f.ctx,tx=>tx.query('SELECT save_project_settings($1)',[{approveIdentityBindings:true}]));
 expect(await f.authenticate()).toMatchObject({ok:false,error:{details:{cause:'identity_pending'}}});expect((await f.row()).binding_status).toBe('pending');
 expect((await f.bindings.change(f.ctx,f.pool,f.id,'approve','wrong')).ok).toBe(false);
 expect((await f.bindings.change(f.ctx,f.pool,f.id,'approve','Fixture credential')).ok).toBe(true);expect((await f.authenticate()).ok).toBe(true);
 expect((await f.bindings.change(f.ctx,f.pool,f.id,'reset','Fixture credential')).ok).toBe(true);expect(await f.row()).toMatchObject({binding_status:'reset',certificate_fingerprint:null,recipient_identifier:null});
 expect(await f.authenticate(other)).toMatchObject({ok:false,error:{details:{cause:'identity_pending'}}});expect((await f.row()).certificate_fingerprint).toBe(other.fingerprint);
});
it('ID-01 migrated custody enrollment must match the previously associated XQ recipient',async()=>{
 const f=await fixture();await withTenant(f.ctx,tx=>tx.query('UPDATE pool_credential SET enrollment_recipient_identifier=$2 WHERE id=$1',[f.id,enrollment.recipientIdentifier]));
 expect(await f.authenticate(certificate,{...enrollment,recipientIdentifier:'different@example.invalid'})).toMatchObject({ok:false,error:{details:{cause:'identity_mismatch'}}});expect((await f.row()).binding_status).toBe('unbound');expect((await f.authenticate()).ok).toBe(true);
});

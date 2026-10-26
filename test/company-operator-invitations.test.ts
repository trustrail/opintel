import {randomUUID,createHash} from 'node:crypto';
import {beforeEach,it,expect} from 'vitest';
import {resetDatabaseBeforeEach} from './database-fixture.js';
import {withPlatform,withPlatformAdmin} from '../src/platform/db/scope.js';
import {CompanyId,UserId,InviteId,SessionId,SystemClock,ok} from '../src/shared/kernel/index.js';
import {inviteCompanyMember,RelationshipOutbox} from '../src/modules/tenancy/index.js';
import {PostgresInvitationRepository} from '../src/modules/tenancy/infrastructure/invitation-repository.js';
import {InvitationService} from '../src/modules/tenancy/application/invitations.js';
import {PostgresIdentityRepository} from '../src/modules/identity/infrastructure/magic-link-repositories.js';
import {MagicLinkService} from '../src/modules/identity/application/magic-link.js';
import {PostgresMagicLinkAccess} from '../src/modules/identity/infrastructure/magic-link-access.js';
import type {AuthorizationPort,AuthorizationRevision} from '../src/modules/authz/index.js';
import type {MailPort} from '../src/platform/mail/index.js';
resetDatabaseBeforeEach('company','user_account','mail_outbox','relationship_outbox');
const clock=new SystemClock();let company:CompanyId,owner:UserId,token:string;
const mail:MailPort={send:async message=>{token=String(message.vars.token??'');return ok({providerId:'synthetic',acceptedAt:clock.now()});}};
beforeEach(async()=>{company=CompanyId(randomUUID());owner=UserId(randomUUID());token='';await withPlatformAdmin({actor:{kind:'system',name:'operator-invitation-test'}},async tx=>{
 await tx.query("INSERT INTO company(id,name,default_region) VALUES($1,'Customer','us-east-1')",[company]);await tx.query("INSERT INTO user_account(id,email,last_login_at) VALUES($1,'owner@example.invalid',now())",[owner]);await tx.query("INSERT INTO company_member(company_id,user_id,role) VALUES($1,$2,'admin')",[company,owner]);
});});
function services(fail=false){
 const authorization:AuthorizationPort={check:async()=>({allowed:true,checkedAt:clock.now(),token:'synthetic' as AuthorizationRevision,snapshotAgeMs:0}),checkMany:async()=>[],explain:async()=>({allowed:true,path:[]}),write:async()=>{if(fail)throw new Error('unavailable');return 'synthetic' as AuthorizationRevision;}};
 const invitations=new InvitationService(new PostgresInvitationRepository(new RelationshipOutbox()),authorization,clock,{dispatch:async()=>{}}),identity=new PostgresIdentityRepository(clock,invitations);
 const links=new MagicLinkService(identity,identity,identity,{check:async()=>({allowed:true,retryAfterSeconds:0})},{create:async()=>SessionId(randomUUID()),read:async()=>null,touch:async()=>{},rotate:async()=>SessionId(randomUUID()),revoke:async()=>{},revokeAllFor:async()=>0,listFor:async()=>[]},clock,new PostgresMagicLinkAccess());
 return {invitations,links};
}
it.each(['admin','member'] as const)('DEP-022: host-issued %s invitation grants only after normal verified email acceptance',async role=>{
 const result=await inviteCompanyMember({email:'person@example.invalid',role,companyId:company,actorId:owner},mail);expect(result.ok).toBe(true);expect(token).not.toBe('');
 expect(await withPlatform(tx=>tx.query("SELECT 1 FROM user_account WHERE email='person@example.invalid'"))).toHaveLength(0);
 const {links}=services();expect((await links.confirm({token,deviceNonce:'browser',confirm:true,ip:'192.0.2.1',userAgent:'synthetic'})).kind).toBe('session');
 expect(await withPlatform(tx=>tx.query("SELECT m.role FROM company_member m JOIN user_account u ON u.id=m.user_id WHERE u.email='person@example.invalid' AND m.company_id=$1",[company]))).toEqual([{role}]);
 expect(await withPlatform(tx=>tx.query('SELECT 1 FROM project_member'))).toHaveLength(0);
});
it('DEP-022: failed authorization write leaves company membership absent and invitation pending',async()=>{
 const result=await inviteCompanyMember({email:'person@example.invalid',role:'admin',companyId:company,actorId:owner},mail);if(!result.ok)throw result.error;
 const {links}=services(true);await expect(links.confirm({token,deviceNonce:'browser',confirm:true,ip:'192.0.2.1',userAgent:'synthetic'})).rejects.toThrow('Access could not be confirmed');
 expect(await withPlatform(tx=>tx.query('SELECT 1 FROM company_member WHERE company_id=$1 AND user_id<>$2',[company,owner]))).toHaveLength(0);
 expect(await withPlatform(tx=>tx.query('SELECT accepted_at FROM pending_invite WHERE id=$1',[result.value.id]))).toEqual([{accepted_at:null}]);
});
it('DEP-022: historical projectless invitation cannot acquire new company authority',async()=>{
 const user=UserId(randomUUID()),id=InviteId(randomUUID());await withPlatformAdmin({actor:{kind:'system',name:'legacy-invitation-test'}},async tx=>{await tx.query("INSERT INTO user_account(id,email) VALUES($1,'legacy@example.invalid')",[user]);await tx.query("INSERT INTO pending_invite(id,email,company_id,role,token_hash,expires_at,created_by) VALUES($1,'legacy@example.invalid',$2,'admin',$3,now()+interval '1 day',$4)",[id,company,createHash('sha256').update(randomUUID()).digest(),owner]);});
 expect((await services().invitations.accept(id,user,{method:'magic_link',sessionId:SessionId(randomUUID())})).ok).toBe(false);
 expect(await withPlatform(tx=>tx.query('SELECT 1 FROM company_member WHERE company_id=$1 AND user_id=$2',[company,user]))).toHaveLength(0);
});

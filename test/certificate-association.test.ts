import {EnrollmentChallenge} from '../src/shared/api/credential-identity.js';
import {PostgresPoolReader,PostgresCredentialBindings,CredentialId} from '../src/modules/pools/index.js';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {afterEach,expect,it,vi} from 'vitest';
import {CertificateAssociation,matchesObservedRecipient} from '../src/shared/api/certificate-association.js';
import {IssueCredentialBody,PoolKeyCreationResponse,poolKeyOpenApiDocument} from '../src/shared/api/pool-keys.js';
import {PoolKeyService,PostgresPoolKeys,credentialCustodyRecipient} from '../src/modules/pools/index.js';
import {QueryRelease,ReleaseService,PostgresReleaseRepository,PostgresGrantSignatures,type ReleaseProvider} from '../src/modules/release-custody/index.js';
import {withPlatform,withTenant} from '../src/platform/db/scope.js';
import {ok,type Result} from '../src/shared/kernel/index.js';
import {bulkFixture,allowBulk} from './fixtures/bulk-entitlements/fixture.js';
import {queryFixture} from './fixtures/query/fixture.js';
import {PostgresEvidenceWriter} from '../src/modules/evidence/index.js';
import {createHttpServer} from '../src/platform/http/index.js';
import {poolKeyRoutes} from '../src/modules/pools/api/key-routes.js';
import {checkBinding} from '../src/modules/release-custody/infrastructure/availability.js';

afterEach(()=>vi.restoreAllMocks());
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw r.error;return r.value;};
const association={certificateId:223,deviceName:'testdevice',recipientIdentifier:'  opaque-recipient-as-supplied  '};
const presence={affected:async()=>ok({affectedAgentCount:0,affectedAgents:[],previouslySeenAgents:[]})};

it('rejects key-like registration material and unknown key fields; exposes only public metadata in OpenAPI',()=>{
 for(const secret of ['-----BEGIN PRIVATE KEY-----\nSYNTHETIC\n-----END PRIVATE KEY-----','PKCS#8 synthetic','transport_key synthetic','A'.repeat(64)]){
  for(const field of ['deviceName','recipientIdentifier'])expect(CertificateAssociation.safeParse({...association,[field]:secret}).success).toBe(false);
 }
 for(const field of ['privateKey','transportKey','bundle','pem'])expect(IssueCredentialBody.safeParse({projectId:randomUUID(),label:'Reader',certificateAssociation:{...association,[field]:'synthetic'}}).success).toBe(false);
 expect(CertificateAssociation.safeParse({...association,deviceName:''}).success).toBe(false);
 expect(CertificateAssociation.safeParse({...association,certificateId:1.5}).success).toBe(false);
 expect(CertificateAssociation.safeParse({...association,recipientIdentifier:''}).success).toBe(false);
 expect(matchesObservedRecipient({certificateId:223,deviceName:'testdevice',recipientIdentifier:'testdevice_crt_223@123.trusted.local'})).toBe(true);
 expect(matchesObservedRecipient(association)).toBe(false);
 expect(()=>poolKeyOpenApiDocument()).not.toThrow();
});

it('registration HTTP boundary rejects key material with a clear non-echoing error before service execution',async()=>{
 const service=new PoolKeyService(new PostgresPoolKeys(),presence),execute=vi.spyOn(service,'execute');
 const server=createHttpServer(poolKeyRoutes(service),{authorization:{currentUser:async()=>null,port:allowBulk}});server.listen(0,'127.0.0.1');await once(server,'listening');
 const address=server.address();if(!address||typeof address==='string')throw new Error('Missing fixture listener');
 try{
  for(const certificateAssociation of [{...association,privateKey:'SYNTHETIC_PRIVATE_SENTINEL'},{...association,recipientIdentifier:'-----BEGIN PRIVATE KEY-----\nSYNTHETIC_PRIVATE_SENTINEL'}]){
   const response=await fetch(`http://127.0.0.1:${address.port}/api/v1/pools/${randomUUID()}/credentials`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:randomUUID(),label:'Reader',certificateAssociation})});
   expect(response.status).toBe(400);const body=await response.text();expect(body).toContain('Never submit a private key');expect(body).not.toContain('SYNTHETIC_PRIVATE_SENTINEL');
  }
  expect(execute).not.toHaveBeenCalled();
 }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

it('binds the supplied public association after possession proof, replays issuance idempotently and keeps the internal identity',async()=>{
 const f=await bulkFixture(0);await withPlatform(tx=>tx.query('INSERT INTO user_account(id,email) VALUES($1,$2)',[f.ctx.userId,`${f.ctx.userId}@example.com`]));
 const service=new PoolKeyService(new PostgresPoolKeys(),presence),request=randomUUID();
 const command={kind:'issue' as const,poolId:f.pool,label:'Device'};
 const issued=PoolKeyCreationResponse.parse(unwrap(await service.execute(f.ctx,command,request)));
 let proofNonce='';const enrollmentBindings=new PostgresCredentialBindings({escrowEnrollment:async(_ctx,nonce)=>{proofNonce=Buffer.from(nonce).toString('base64url');return 'fixture-locator';}});
 const challengeResult=await enrollmentBindings.authenticate(f.ctx,f.pool,CredentialId(issued.credentialId!),{fingerprint:'a'.repeat(64),subject:'CN=Fixture'},association);if(challengeResult.ok)throw new Error('Missing enrollment challenge');
 const challenge=EnrollmentChallenge.parse(challengeResult.error.details?.challenge);
 unwrap(await enrollmentBindings.authenticate(f.ctx,f.pool,CredentialId(issued.credentialId!),{fingerprint:'a'.repeat(64),subject:'CN=Fixture'},{...association,proof:{id:challenge.id,nonce:proofNonce}}));
 expect(issued.custodyAlias).toBe(`agent:${f.ctx.projectId}:${issued.credentialId}`);
 expect(await credentialCustodyRecipient(f.ctx,issued.custodyAlias!)).toBe(association.recipientIdentifier);
 const detail=await new PostgresPoolReader().detail(f.ctx,f.pool);if(!detail.ok)throw detail.error;expect(detail.value.credentials?.find(c=>c.id===issued.credentialId)?.xqIdentity).toEqual({certificateId:association.certificateId,deviceName:association.deviceName});
 const [row]=await withTenant(f.ctx,tx=>tx.query('SELECT certificate_id,device_name,recipient_identifier,identity_kind,association_status,association_recorded_at FROM pool_credential WHERE id=$1',[issued.credentialId]));
 expect(row).toMatchObject({certificate_id:223,device_name:'testdevice',recipient_identifier:association.recipientIdentifier,identity_kind:'certificate',association_status:'associated',association_recorded_at:expect.any(Date)});
 expect(unwrap(await service.execute(f.ctx,command,request))).toMatchObject({keyShown:false,credentialId:issued.credentialId});
 expect(await withTenant(f.ctx,tx=>tx.query("SELECT action FROM audit_entry WHERE action='CredentialIdentityBound'"))).toEqual([{action:'CredentialIdentityBound'}]);
 const other=await bulkFixture(0);expect(await credentialCustodyRecipient(other.ctx,issued.custodyAlias!)).toBeNull();
 await withTenant(f.ctx,tx=>tx.query("UPDATE pool_credential SET association_status='revoked' WHERE id=$1",[issued.credentialId]));
 expect(await credentialCustodyRecipient(f.ctx,issued.custodyAlias!)).toBeNull();
});

it('XQ association addresses escrow only; grant subject and receipt remain the internal credential',async()=>{
 const f=await queryFixture(new PostgresEvidenceWriter(),{releaseCustody:true});
 try{
  const service=new PoolKeyService(new PostgresPoolKeys(),presence);
  const issued=PoolKeyCreationResponse.parse(unwrap(await service.execute(f.ctx,{kind:'issue',poolId:f.pool,label:'Device'},randomUUID())));
  if(!issued.keyShown)throw new Error('Expected issued key');
  const escrow=vi.fn(async()=> 'opaque-locator');
  const provider:ReleaseProvider={id:'xq',tenant:'test',redeemAt:'https://provider.invalid/key',escrow,revoke:async()=>{},redemptions:async()=>({status:'unsupported'})};
  const releases=new ReleaseService(new PostgresReleaseRepository(f.ctx.projectId),new PostgresGrantSignatures(provider,'11'.repeat(32)),provider);
  const query=new QueryRelease(provider,releases,'https://application.invalid/redeem');
  const configuration={provider:'xq' as const,tenant:'test',region:''};
  await withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{custody}',$2),custody_check=$3 WHERE id=$1",[f.ctx.projectId,configuration,{binding:checkBinding(configuration),passed:true,at:new Date().toISOString(),failure:null}]));
  // Substitute only the custody implementation; keep real MCP, Engine sealing,
  // grant persistence and evidence. No live XQ call is made.
  vi.spyOn(f.release!,'seal').mockImplementation((...args)=>query.seal(...args));
  await withTenant(f.ctx,tx=>tx.query("UPDATE entitlement SET treatment='custody' WHERE pool_id=$1 AND element_id=$2",[f.pool,f.ids[0]]));
  const client=await f.connect(issued.key,'fixture-agent','header',association);
  const answer=await client.query('SELECT field_1 FROM warehouse.public.records LIMIT 1');
  expect(answer.isError).not.toBe(true);expect(escrow).toHaveBeenCalledOnce();
  expect(escrow.mock.calls[0]).toEqual([expect.any(Uint8Array),association.recipientIdentifier,expect.any(Number),true,expect.any(String)]);
  const grants=await withTenant(f.ctx,tx=>tx.query<{claims:{sub:string;rcpt:string}}>('SELECT claims FROM release_grant'));
  expect(grants).toHaveLength(1);expect(grants[0]!.claims.sub).toBe(issued.custodyAlias);
  expect(await withTenant(f.ctx,tx=>tx.query('SELECT custody_alias FROM query_run WHERE id=$1',[grants[0]!.claims.rcpt]))).toEqual([{custody_alias:issued.custodyAlias}]);
  escrow.mockClear();
  await withTenant(f.ctx,tx=>tx.query("UPDATE pool_credential SET association_status='revoked' WHERE id=$1",[f.issued.credentialId]));
  const refused=await f.query('SELECT field_1 FROM warehouse.public.records LIMIT 1');
  expect(refused).toMatchObject({isError:true,content:[{type:'text',text:'This credential has no active XQ certificate association. No result was released. Ask an administrator to register its public certificate association.'}],_meta:{cause:'release_prepare_failed',reason:'certificate_association_missing',evidenceId:expect.any(String)}});expect(refused).not.toHaveProperty('structuredContent');expect(escrow).not.toHaveBeenCalled();
  expect(await withTenant(f.ctx,tx=>tx.query("SELECT c.outcome->>'kind' AS kind FROM run_completion c JOIN query_run r ON r.id=c.run_id AND r.started_at=c.started_at WHERE r.credential_id=$1",[f.issued.credentialId]))).toEqual([{kind:'refused'}]);
 }finally{await f.close();}
},60000);

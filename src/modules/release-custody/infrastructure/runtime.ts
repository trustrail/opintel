import {z} from 'zod';
import {ProjectSettingsView,type ProjectSettings} from '../../../shared/api/settings.js';
import {custodyAvailability,custodyEnvironment,checkBinding,custodyExecutionAvailable} from './availability.js';
import {readSetting} from '../../../shared/project-settings.js';
import {CustodyProviderStatus} from '../../../shared/api/release-custody.js';
import {sealResult} from './crypto.js';
import {withPlatform,withTenant,type Tx} from '../../../platform/db/scope.js';
import {DomainError,err,ProjectId,UserId} from '../../../shared/kernel/index.js';
import {releaseClaims} from '../../../shared/release-contract.js';
import {PostgresKeyVerifier} from '../../pools/index.js';
import type {ReleaseContext,ReleaseProvider} from '../application/ports.js';
import {ReleaseService} from '../application/service.js';
import {QueryRelease} from './query-release.js';
import {LocalReleaseProvider} from './local-provider.js';
import {XqReleaseProvider} from './xq-provider.js';
import {PostgresGrantSignatures} from './signatures.js';
import {PostgresReleaseRepository} from './repository.js';
const config=z.record(z.uuid(),z.discriminatedUnion('provider',[
 z.strictObject({provider:z.literal('local'),applicationUrl:z.url()}),
 z.strictObject({provider:z.literal('xq'),region:z.string().optional(),applicationUrl:z.url(),tenant:z.string().min(1),providerRedeemAt:z.url(),apiKey:z.string().min(1),dashboardApiKey:z.string(),senderAlias:z.string().min(1),senderAccessToken:z.string().min(1)}),
]));
/** Configuration is explicit per project. No provider or signing-key fallback. */
export class ReleaseRuntime {
 private readonly projects=new Map<string,{provider:ReleaseProvider;service:ReleaseService;query:QueryRelease}>();
 private readonly fixtureProjects:ReadonlySet<string>|undefined;
 private readonly bindings=new Map<string,string>();
 private sweeping=false;
 private timer:ReturnType<typeof setInterval>|undefined;
 constructor(raw?:string,private readonly sealer:typeof sealResult=sealResult,private readonly master=process.env.OPINTEL_CUSTODY_MASTER_KEY){
  const parsed=config.parse(raw?JSON.parse(raw) as unknown:{});
  this.fixtureProjects=raw?new Set(Object.keys(parsed)):undefined;
  for(const [project,c] of Object.entries(parsed))this.install(project,c);
 }
 private install(project:string,c:z.infer<typeof config>[string]){
   let signatures:PostgresGrantSignatures;
   let provider:ReleaseProvider;
   if(c.provider==='local')provider=new LocalReleaseProvider(async credential=>{const v=await new PostgresKeyVerifier().verify(credential);return v.ok&&v.pool.projectId===project?v.custodyAlias??null:null;},async grant=>{
    try{const claims=releaseClaims.parse(JSON.parse(Buffer.from(grant.split('.')[1]??'','base64url').toString('utf8')) as unknown);if(claims.iss!==project)return null;const [user]=await withPlatform(tx=>tx.query<{user_id:string}>('SELECT user_id FROM project_member WHERE project_id=$1 ORDER BY user_id LIMIT 1',[project]));if(!user)return null;const v=await signatures.verify({projectId:ProjectId(project),userId:UserId(user.user_id)},grant);return v.ok?v.value:null;}catch{return null;}
   });
   else provider=new XqReleaseProvider({apiKey:c.apiKey,dashboardApiKey:c.dashboardApiKey,dashboardAccessToken:process.env.OPINTEL_XQ_DASHBOARD_ACCESS_TOKEN??'',senderAlias:c.senderAlias,senderAccessToken:c.senderAccessToken},c.tenant,c.providerRedeemAt,c.region);
   signatures=new PostgresGrantSignatures(provider,this.master);
   if(provider instanceof LocalReleaseProvider)Object.defineProperty(provider,'redeemAt',{value:new URL(`/mcp/v1/p/${project}/custody/local`,c.applicationUrl).href});
   const service=new ReleaseService(new PostgresReleaseRepository(project),signatures,provider);
   this.projects.set(project,{provider,service,query:new QueryRelease(provider,service,new URL(`/mcp/v1/p/${project}`,c.applicationUrl).href,this.sealer)});
 }
 private async ensure(ctx:ReleaseContext){
  const state=await custodyAvailability(ctx.projectId);if(!state.configuration)return undefined;
  const binding=JSON.stringify([state.configuration.provider,state.configuration.tenant]),previous=this.bindings.get(ctx.projectId);
  if(previous&&previous!==binding)return undefined;
  if(!this.projects.has(ctx.projectId)){const environment=custodyEnvironment(),c=state.configuration;
   if(!environment.applicationUrl)return undefined;
   const applicationUrl=z.url().parse(environment.applicationUrl);
   if(c.provider==='local')this.install(ctx.projectId,{provider:'local',applicationUrl});
   else if(environment.redeemAt)this.install(ctx.projectId,{provider:'xq',region:c.region,applicationUrl,tenant:c.tenant,providerRedeemAt:z.url().parse(environment.redeemAt),apiKey:environment.apiKey,dashboardApiKey:environment.dashboardApiKey,senderAlias:environment.senderAlias,senderAccessToken:environment.senderAccessToken});
  }
  if(this.projects.has(ctx.projectId))this.bindings.set(ctx.projectId,binding);
  return this.projects.get(ctx.projectId);
 }
 private originalProvider(project:string,claims:z.infer<typeof releaseClaims>):ReleaseProvider{
  const current=this.projects.get(project)?.provider;if(current?.id===claims.custody.provider&&current.tenant===claims.custody.tenant)return current;
  if(claims.custody.provider==='local')return new LocalReleaseProvider(async()=>null,async()=>null);
  if(claims.custody.provider!=='xq')throw new DomainError('dependency_unavailable','The original custody provider is unavailable.',{cause:'release_configuration'});
  const environment=custodyEnvironment();return new XqReleaseProvider({apiKey:environment.apiKey,dashboardApiKey:environment.dashboardApiKey,dashboardAccessToken:environment.dashboardAccessToken,senderAlias:environment.senderAlias,senderAccessToken:environment.senderAccessToken},claims.custody.tenant,claims.custody.provider_redeem_at);
 }
 private originalService(project:string,claims:z.infer<typeof releaseClaims>){const provider=this.originalProvider(project,claims);return new ReleaseService(new PostgresReleaseRepository(project),new PostgresGrantSignatures(provider,this.master),provider);}
 async saveProjectSettings(ctx:ReleaseContext,settings:z.infer<typeof ProjectSettings>,confirmedLiveGrants?:number){
  return withTenant(ctx,async tx=>{
   // Exclusive against every grant creation/redemption transaction. A confirmed
   // count cannot become stale between this check and the configuration save.
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,538))',[ctx.projectId]);
   const [before]=await withPlatform(scope=>scope.query<{settings:unknown}>('SELECT settings FROM project WHERE id=$1',[ctx.projectId]));
   const changed=settings.custody!==undefined&&['custody.provider','custody.tenant'].some(path=>readSetting(before?.settings,path)!==readSetting(settings,path));
   if(changed){
    const rows=await tx.query<{id:string;receipt_id:string;claims:unknown}>("SELECT id,receipt_id,claims FROM release_grant WHERE expires_at>clock_timestamp() AND state IN ('granted','redeemed') AND NOT EXISTS(SELECT 1 FROM release_event e WHERE e.grant_id=release_grant.id AND e.kind='revoked') ORDER BY id FOR UPDATE");
    if(rows.length&&confirmedLiveGrants!==rows.length)return err(new DomainError('conflict',`Revoke ${rows.length} live grants and switch provider?`,{cause:'custody_provider_change',liveGrantCount:rows.length}));
    for(const row of rows){
     const claims=releaseClaims.parse(row.claims),provider=this.originalProvider(ctx.projectId,claims);
     // Unknown local escrow cannot be recovered after a restart; it is already
     // gone. Never send an original locator to a newly selected tenant.
     try{await provider.revoke(claims.custody.locator);}catch{return err(new DomainError('dependency_unavailable','The original custody provider could not acknowledge revocation. The provider configuration was not changed.',{cause:'release_configuration'}));}
     await tx.query("UPDATE release_grant SET share=NULL,state='revoked',escrow_revoked=true WHERE id=$1",[row.id]);
     await tx.query("INSERT INTO release_event(project_id,grant_id,receipt_id,kind,occurred_at,alias,actor,jur_observed,reason) VALUES($1,$2,$3,'revoked',clock_timestamp(),$4,$5,NULL,'provider changed') ON CONFLICT(grant_id,kind) DO NOTHING",[ctx.projectId,row.id,row.receipt_id,claims.sub,ctx.userId]);
    }
   }
   const [row]=await tx.query<{settings:unknown}>('SELECT save_project_settings($1) AS settings',[settings]);
   if(changed){this.bindings.delete(ctx.projectId);const previous=this.projects.get(ctx.projectId);if(previous?.provider instanceof LocalReleaseProvider)previous.provider.close();this.projects.delete(ctx.projectId);}
   return {ok:true as const,value:ProjectSettingsView.parse(row)};
  });
 }
 /** Shared lifecycle hook: caller holds the project release lock exclusively. */
 async revokeInScope(tx:Tx,ctx:ReleaseContext,aliases:readonly string[],confirmedLiveGrants:number|undefined,reason:string){
  const rows=await tx.query<{id:string;receipt_id:string;claims:unknown}>("SELECT id,receipt_id,claims FROM release_grant WHERE claims->>'sub'=ANY($1::text[]) AND expires_at>clock_timestamp() AND state IN ('granted','redeemed') AND NOT EXISTS(SELECT 1 FROM release_event e WHERE e.grant_id=release_grant.id AND e.kind='revoked') ORDER BY id FOR UPDATE",[aliases]);
  if(rows.length&&confirmedLiveGrants!==rows.length)return err(new DomainError('conflict',`Revoke ${rows.length} live grants and revoke this credential?`,{cause:'credential_revocation',liveGrantCount:rows.length}));
  for(const row of rows){const claims=releaseClaims.parse(row.claims);
   try{await this.originalProvider(ctx.projectId,claims).revoke(claims.custody.locator);}catch{return err(new DomainError('dependency_unavailable','The original custody provider could not acknowledge revocation. The credential was not revoked.',{cause:'release_configuration'}));}
  }
  // Apply local changes only after every remote acknowledgement succeeds.
  for(const row of rows){const claims=releaseClaims.parse(row.claims);
   await tx.query("UPDATE release_grant SET share=NULL,state='revoked',escrow_revoked=true WHERE id=$1",[row.id]);
   await tx.query("INSERT INTO release_event(project_id,grant_id,receipt_id,kind,occurred_at,alias,actor,jur_observed,reason) VALUES($1,$2,$3,'revoked',clock_timestamp(),$4,$5,NULL,$6) ON CONFLICT(grant_id,kind) DO NOTHING",[ctx.projectId,row.id,row.receipt_id,claims.sub,ctx.userId,reason]);
  }
  return {ok:true as const,value:undefined};
 }
 private async retireLegacyAliases(){
  const pending=await withPlatform(tx=>tx.query<{project_id:string;user_id:string;key_id:string}>('SELECT * FROM public.pending_credential_alias_cleanup()'));
  for(const row of pending){const ctx={projectId:ProjectId(row.project_id),userId:UserId(row.user_id)};await withTenant(ctx,async tx=>{
   await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,538))',[ctx.projectId]);
   const [key]=await tx.query<{custody_alias:string}>("SELECT custody_alias FROM pool_key WHERE id=$1 AND alias_retired_at IS NULL AND (state IN ('revoked','expired') OR grace_until<=clock_timestamp()) FOR UPDATE",[row.key_id]);if(!key)return;
   // Include all outstanding escrows, even grants that have just expired.
   const grants=await tx.query<{id:string;receipt_id:string;claims:unknown;state:string}>("SELECT id,receipt_id,claims,state FROM release_grant WHERE claims->>'sub'=$1 AND NOT escrow_revoked FOR UPDATE",[key.custody_alias]);
   let complete=true;
   for(const grant of grants){const claims=releaseClaims.parse(grant.claims);let acknowledged=false;
    try{await this.originalProvider(ctx.projectId,claims).revoke(claims.custody.locator);acknowledged=true;}catch{complete=false; /* Delete K2 now; retain remote cleanup for retry. */ }
    await tx.query("UPDATE release_grant SET share=NULL,state=CASE WHEN state='granted' THEN 'revoked' ELSE state END,escrow_revoked=$2 WHERE id=$1",[grant.id,acknowledged]);await tx.query("INSERT INTO release_event(project_id,grant_id,receipt_id,kind,occurred_at,alias,actor,reason) VALUES($1,$2,$3,'revoked',clock_timestamp(),$4,'system','legacy alias grace ended') ON CONFLICT(grant_id,kind) DO NOTHING",[ctx.projectId,grant.id,grant.receipt_id,claims.sub]);}
   if(complete)await tx.query('UPDATE pool_key SET alias_retired_at=clock_timestamp() WHERE id=$1',[row.key_id]);
  });}
 }
 async isConfigured(projectId:ProjectId){return (await custodyAvailability(projectId)).configuration!==null;}
 available(ctx:ReleaseContext){return custodyExecutionAvailable(ctx.projectId);}
 async status(ctx:ReleaseContext){const state=await custodyAvailability(ctx.projectId),environment=custodyEnvironment();const [facts]=await withTenant(ctx,tx=>tx.query<{affected:number;kid:string|null}>("SELECT (SELECT count(DISTINCT t.element_id)::int FROM entitlement t JOIN catalog_element e ON e.id=t.element_id JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id WHERE t.treatment='custody' AND e.status='active' AND o.status='active' AND s.status<>'archived' AND EXISTS(SELECT 1 FROM pool_source_binding b WHERE b.pool_id=t.pool_id AND b.source_id=s.id)) AS affected,(SELECT kid FROM release_signing_key WHERE retired_at IS NULL) AS kid"));return CustodyProviderStatus.parse({provider:state.configuration?.provider??null,available:state.available,reason:state.reason,checkedAt:state.checkedAt,apiKeySet:!!environment.apiKey,dashboardKeySet:!!environment.dashboardApiKey,dashboardCheck:await withPlatform(async tx=>{const [row]=await tx.query<{custody_check:unknown}>('SELECT custody_check FROM project WHERE id=$1',[ctx.projectId]);const parsed=z.object({dashboard:z.object({status:z.enum(['authenticated','failed','not_set']),failure:z.string().nullable()}).nullable().optional()}).safeParse(row?.custody_check);return parsed.success?parsed.data.dashboard??null:null;}),signingKeyId:facts?.kid??null,affectedColumns:facts?.affected??0});}
 async checkConnection(ctx:ReleaseContext){const state=await custodyAvailability(ctx.projectId),p=await this.ensure(ctx);let result:import('../application/ports.js').ProviderHealth;
  if(!p||!this.master||!/^[0-9a-f]{64}$/u.test(this.master))result={reachable:false,authenticated:false,failure:'credentials_missing'};
  else if(p.provider instanceof LocalReleaseProvider||p.provider instanceof XqReleaseProvider)result=await p.provider.health();
  else result={reachable:false,authenticated:false,failure:'invalid_response'};
  await withTenant(ctx,tx=>tx.query('SELECT record_custody_check($1)',[{binding:state.configuration?checkBinding(state.configuration):'',passed:result.authenticated&&result.failure===null,at:new Date().toISOString(),failure:result.failure,dashboard:result.dashboard??null}]));return result;
 }
 async rotateSigningKey(ctx:ReleaseContext){const p=await this.ensure(ctx);if(!p)throw new DomainError('dependency_unavailable','Configure a custody provider before rotating its signing key.',{cause:'release_configuration'});const state=await custodyAvailability(ctx.projectId),ttl=Number(readSetting(state.settings,'custody.grant_ttl')??600),keys=new PostgresGrantSignatures(p.provider,this.master);const result=await keys.rotate(ctx,ttl);const active=await withTenant(ctx,tx=>tx.query<{kid:string}>('SELECT kid FROM release_signing_key WHERE retired_at IS NULL'));return {signingKeyId:active[0]?.kid??result.keys.at(-1)!.kid};}
 async seal(...args:Parameters<QueryRelease['seal']>){const state=await custodyAvailability(args[0].projectId);if(!state.available)return err(new DomainError('dependency_unavailable',`Custody provider unavailable: ${state.reason}. No result was released. Configure a custody provider in Settings.`,{cause:'release_configuration',reason:state.reason}));const p=await this.ensure(args[0]);return p?p.query.seal(...args):err(new DomainError('dependency_unavailable','Release custody is not configured for this project. No result was released.',{cause:'release_configuration'}));}
 async discard(ctx:ReleaseContext,grants:readonly {grant:string}[]){await this.projects.get(ctx.projectId)?.query.discard(ctx,grants);}
 async describe(ctx:ReleaseContext){return (await this.ensure(ctx))?.service.describe(ctx);}
 async provision(ctx:ReleaseContext,alias:string){await (await this.ensure(ctx))?.provider.register(alias);}
 async provisionExisting(){const configured=await withPlatform(tx=>tx.query<{id:string}>("SELECT id FROM project WHERE settings->'custody'->>'provider' IN ('local','xq')"));for(const projectId of new Set([...this.projects.keys(),...configured.map(p=>p.id)])){const [user]=await withPlatform(tx=>tx.query<{user_id:string}>('SELECT user_id FROM project_member WHERE project_id=$1 ORDER BY user_id LIMIT 1',[projectId]));if(!user)continue;const ctx={projectId:ProjectId(projectId),userId:UserId(user.user_id)};for(const key of await withTenant(ctx,tx=>tx.query<{custody_alias:string}>("SELECT custody_alias FROM pool_credential WHERE revoked_at IS NULL UNION SELECT k.custody_alias FROM pool_key k JOIN pool_credential c ON c.id=k.credential_id WHERE c.revoked_at IS NULL AND k.state='retiring' AND k.grace_until>now()")))await this.provision(ctx,key.custody_alias);}}
 async redeem(ctx:ReleaseContext,grant:string,alias:string,origin:string|null){const [row]=await withTenant(ctx,tx=>tx.query<{claims:unknown}>('SELECT claims FROM release_grant WHERE grant_jws=$1',[grant]));return row?this.originalService(ctx.projectId,releaseClaims.parse(row.claims)).redeem(ctx,grant,alias,origin):err(new DomainError('forbidden','This release grant is unavailable. No release share was returned.',{cause:'release_refused'}));}
 async redeemLocal(ctx:ReleaseContext,grant:string,credential:string){const p=this.projects.get(ctx.projectId);if(!(p?.provider instanceof LocalReleaseProvider))return err(new DomainError('not_found','The local custody provider is not configured.'));try{const share=await p.provider.redeem(grant,credential);try{return {ok:true as const,value:{share:share.toString('base64url')}};}finally{share.fill(0);}}catch{return err(new DomainError('forbidden','Local custody redemption refused. No release share was returned.'));}}
 async revoke(ctx:ReleaseContext,id:string,actor:string){const rows=await withTenant(ctx,tx=>tx.query<{id:string;claims:unknown}>('SELECT id,claims FROM release_grant WHERE id=$1 OR receipt_id=$1',[id]));if(!rows.length)return err(new DomainError('not_found','The release grant or receipt was not found in this project.'));for(const row of rows){const result=await this.originalService(ctx.projectId,releaseClaims.parse(row.claims)).revoke(ctx,row.id,actor);if(!result.ok)return result;}return {ok:true as const,value:undefined};}
 start(){this.timer=setInterval(()=>{void this.sweep().catch(()=>{console.warn({event:'release.cleanup_failed',category:'dependency_unavailable'});});},1000);this.timer?.unref();}
 async sweep(){if(this.sweeping)return;this.sweeping=true;try{await this.retireLegacyAliases();const services=new Map<string,ReleaseService>();for(const {ctx,grantId} of this.fixtureProjects?(await Promise.all([...this.fixtureProjects].map(project=>new PostgresReleaseRepository(project).due()))).flat():await new PostgresReleaseRepository().due()){const [row]=await withTenant(ctx,tx=>tx.query<{claims:unknown}>('SELECT claims FROM release_grant WHERE id=$1',[grantId]));if(!row)continue;const claims=releaseClaims.parse(row.claims),key=JSON.stringify([ctx.projectId,claims.custody.provider,claims.custody.tenant]);if(!services.has(key))services.set(key,this.originalService(ctx.projectId,claims));}for(const service of services.values())await service.sweep();}finally{this.sweeping=false;}}
 close(){clearInterval(this.timer);for(const p of this.projects.values())if(p.provider instanceof LocalReleaseProvider)p.provider.close();}
}

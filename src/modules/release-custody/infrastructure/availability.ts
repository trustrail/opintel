import {createHmac} from 'node:crypto';
import {z} from 'zod';
import {withPlatform} from '../../../platform/db/scope.js';
import {DomainError,err,ok,type ProjectId} from '../../../shared/kernel/index.js';
import {readSetting} from '../../../shared/project-settings.js';
export const providerConfiguration=z.strictObject({provider:z.enum(['local','xq']),tenant:z.string().default(''),region:z.string().default('')});
export type ProviderConfiguration=z.infer<typeof providerConfiguration>;
export function custodyEnvironment(){return {apiKey:process.env.OPINTEL_XQ_API_KEY??'',dashboardApiKey:process.env.OPINTEL_XQ_DASHBOARD_API_KEY??'',dashboardAccessToken:process.env.OPINTEL_XQ_DASHBOARD_ACCESS_TOKEN??'',senderAlias:process.env.OPINTEL_XQ_SENDER_ALIAS??'',senderAccessToken:process.env.OPINTEL_XQ_SENDER_ACCESS_TOKEN??'',master:process.env.OPINTEL_CUSTODY_MASTER_KEY??'',redeemAt:process.env.OPINTEL_XQ_REDEEM_URL??'',applicationUrl:process.env.OPINTEL_API_BASE_URL??''};}
export function configurationFrom(settings:unknown){const provider=readSetting(settings,'custody.provider');return providerConfiguration.safeParse({provider,tenant:readSetting(settings,'custody.tenant'),region:readSetting(settings,'custody.region')});}
/** An opaque check binding, not a credential or an authentication alternative. */
export function checkBinding(config:ProviderConfiguration,environment=custodyEnvironment()){
 return createHmac('sha256',environment.master).update(JSON.stringify([config,environment.applicationUrl,config.provider==='xq'?[environment.apiKey,environment.senderAlias,environment.senderAccessToken,environment.redeemAt]:[]])).digest('hex');
}
export async function custodyAvailability(projectId:ProjectId){
 const [row]=await withPlatform(tx=>tx.query<{settings:unknown;custody_check:unknown}>('SELECT settings,custody_check FROM project WHERE id=$1',[projectId]));
 const config=configurationFrom(row?.settings),check=z.object({binding:z.string(),passed:z.boolean(),at:z.iso.datetime(),failure:z.string().nullable()}).safeParse(row?.custody_check);
 const reason=!config.success?'provider_not_configured':!check.success?'provider_not_checked':check.data.binding!==checkBinding(config.data)?'provider_configuration_changed':!check.data.passed?'provider_check_failed':null;
 return {available:reason===null,reason,configuration:config.success?config.data:null,checkedAt:check.success?check.data.at:null,settings:row?.settings};
}
export async function custodyExecutionAvailable(project:ProjectId){const state=await custodyAvailability(project);return state.available?ok(undefined):err(new DomainError('dependency_unavailable','Custody provider unavailable. Configure a custody provider in Settings.',{cause:'release_configuration',reason:state.reason}));}

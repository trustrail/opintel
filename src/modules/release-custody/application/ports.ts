import type {ProjectId,UserId,Result} from '../../../shared/kernel/index.js';
import type {ReleaseClaims,ReleaseEvent,releaseDescription} from '../../../shared/release-contract.js';
import type {z} from 'zod';
export type ReleaseContext={projectId:ProjectId;userId:UserId};
export type ProviderHealth={dashboard?:{status:'authenticated'|'failed'|'not_set';failure:null|'credentials_missing'|'authentication_refused'|'provider_refused'|'unreachable'|'deadline_exceeded'|'invalid_response'};reachable:boolean;authenticated:boolean;failure:null|'credentials_missing'|'authentication_refused'|'provider_refused'|'unreachable'|'deadline_exceeded'|'invalid_response'};
export type ProviderRedemption={locator:string;alias:string;at:Date;origin:string|null};
export type ProviderRedemptions={status:'supported';events:ProviderRedemption[]}|{status:'unsupported'};
export interface ReleaseProvider {
 readonly id:string;readonly tenant:string;readonly redeemAt:string;
 readonly reportedRegion?:string;
 register(alias:string):Promise<void>;
 escrow(key:Uint8Array,alias:string,ttlSeconds:number,singleUse:true,receipt?:string):Promise<string>;
 revoke(locator:string):Promise<void>;
 redemptions(since:Date):Promise<ProviderRedemptions>;
}
export interface GrantSignatures {
 sign(ctx:ReleaseContext,claims:ReleaseClaims):Promise<string>;
 verify(ctx:ReleaseContext,grant:string):Promise<Result<ReleaseClaims>>;
 describe(ctx:ReleaseContext):Promise<z.infer<typeof releaseDescription>>;
}
export type StoredRelease={claims:ReleaseClaims;grant:string;share:Uint8Array|null;state:'granted'|'redeemed'|'expired'|'revoked';escrowRevoked:boolean;revocationRequested?:boolean};
export interface ReleaseSession {
 get():Promise<StoredRelease|null>;
 canIssue(alias:string):Promise<boolean>;
 save(value:StoredRelease):Promise<void>;
 event(value:ReleaseEvent):Promise<void>;
}
/** Repository implementations serialize by grant id; event and share deletion commit atomically. */
export interface ReleaseRepository {
 exclusive<T>(ctx:ReleaseContext,grantId:string,work:(session:ReleaseSession)=>Promise<T>):Promise<T>;
 due():Promise<{ctx:ReleaseContext;grantId:string}[]>;
}

export interface ReleaseRevocationPort {revoke(ctx:ReleaseContext,id:string,actor:string):Promise<Result<void>>;}
export interface ReleaseSettingsPort extends ReleaseRevocationPort {
 saveProjectSettings(ctx:ReleaseContext,settings:import('zod').infer<typeof import('../../../shared/api/settings.js').ProjectSettings>,confirmedLiveGrants?:number):Promise<Result<import('zod').infer<typeof import('../../../shared/api/settings.js').ProjectSettingsView>>>;
 status(ctx:ReleaseContext):Promise<z.infer<typeof import('../../../shared/api/release-custody.js').CustodyProviderStatus>>;
 checkConnection(ctx:ReleaseContext):Promise<ProviderHealth>;
 rotateSigningKey(ctx:ReleaseContext):Promise<{signingKeyId:string}>;
}

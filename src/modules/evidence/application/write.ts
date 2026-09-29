import type {Result,RunId,ProjectId,UserId,PoolId,SourceId,JsonObject,ErrorCode} from '../../../shared/kernel/index.js';
import type {VersionStamp,ElementDelivery,RunStage} from '../domain/query-run.js';
export type EvidencePrincipal={pool:{id:PoolId;projectId:ProjectId};scopeUserId:UserId;agentId:string;keyPrefix:string};
export type EvidenceSource={id:SourceId;origin:'customer'|'demo';freshnessMode:string;landingStrategy:string|null;lastIntrospectedAt:string|null};
export type EvidencePlan={requiresTokenization:boolean;versions:VersionStamp;elements:ElementDelivery[];sources:EvidenceSource[];sourcePlan:JsonObject;stages:RunStage[]};
export type EvidenceFinish=({kind:'answered';rows:number;policyVersion:number;queryEngineVersion:string;truncated?:boolean}|{kind:'refused';code:ErrorCode;message?:string;details?:JsonObject;stage?:RunStage['stage'];retryable?:boolean})&{plan?:EvidencePlan;tokenKeyVersionUsed:number|null;sourceIdsReached:string[];execution?:JsonObject;elapsedMs?:number};
export interface EvidenceWriterPort {
 readonly implementation:'durable'|'test-stub';
 open(principal:EvidencePrincipal,sql:string,plan?:EvidencePlan):Promise<Result<RunId>>;
 close(id:RunId,outcome:EvidenceFinish,principal:EvidencePrincipal):Promise<Result<void>>;
}

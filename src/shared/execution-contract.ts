import {sentinel} from './custody-contract.js';
import {numericProjectSetting} from './project-settings.js';
import { stagingType } from './staging-types.js';
import { z } from 'zod';
const name=z.string().min(1).refine(v=>!v.includes('\0'));
const positive=z.number().int().positive().safe();
export const executionSettings=z.strictObject({
 maxStagingRows:numericProjectSetting('query.maxStagingRows'),
 maxQueuedExecutions:numericProjectSetting('query.maxQueuedExecutions'),
});
const column=z.strictObject({numericDefault:z.enum(['scalar','array']).optional(),sourceIdentifier:name,exposedName:name,
 exposedType:z.string().refine(v=>stagingType(v)!==null),
 treatment:z.enum(['clear','aggregate_only','tokenized','masked']),readAs:z.enum(['text','native']),
 token:z.strictObject({domain:z.string().regex(/^[a-z0-9]+$/u),canonId:name,mode:z.enum(['text','number','date','timestamp']),caseInsensitive:z.boolean(),sourceTimezone:z.string().optional(),epochUnit:z.enum(['seconds','milliseconds']).optional()}).optional(),
 mask:z.strictObject({kind:z.enum(['all','last4','email','year'])}).optional(),elementId:z.uuid(),
}).superRefine((c,ctx)=>{
 const treated=c.treatment==='tokenized'||c.treatment==='masked';
 if(c.readAs!==(treated?'text':'native')||treated&&c.exposedType!=='VARCHAR'||(c.treatment==='tokenized')!==(c.token!==undefined)||(c.treatment==='masked')!==(c.mask!==undefined))ctx.addIssue({code:'custom',message:'The treatment declaration and read plan disagree.'});
});
export const stagingObject=z.strictObject({catalog:name,schema:name,name:name,sourceId:z.uuid(),
 readPlan:z.strictObject({catalog:name,schema:name,object:name,columns:z.array(column).min(1)}),
});
export const executionRequest=z.strictObject({requestId:name,tokenKeyVersionSelected:positive.nullable().default(null),expectedTokenSentinel:sentinel.nullable().optional(),projectId:z.uuid(),poolId:z.uuid(),policyVersion:z.number().int().nonnegative(),
 sql:z.string().min(1),namespace:z.strictObject({catalog:name,schema:name}),
 entitlements:z.array(z.strictObject({elementId:z.uuid(),treatment:z.enum(['clear','aggregate_only','masked','tokenized','withheld'])})),
 sources:z.array(z.strictObject({sourceId:z.uuid(),credentialRef:z.string().startsWith('secret://')})),objects:z.array(stagingObject),
 aggregateMinGroupSize:positive,settings:executionSettings.default({maxStagingRows:5000000,maxQueuedExecutions:8}),
 limits:z.strictObject({memoryMb:positive,threads:positive,timeoutMs:positive.max(2147483647),rowLimit:positive.max(2147483646),concurrency:positive}),
 entitlementContext:z.null(),
});
// Validation accepts execution metadata for compatibility, but does not require
// or use execution limits. /execute retains the strict required contract.
export const validationRequest=executionRequest.extend({limits:executionRequest.shape.limits.optional()});
export type ValidationRequest=z.infer<typeof validationRequest>;
export type ExecutionRequest=z.infer<typeof executionRequest>;
export type StagingObject=z.infer<typeof stagingObject>;
export const executionResponse=z.strictObject({tokenKeyVersionUsed:positive.nullable(),sourceIdsReached:z.array(z.uuid()),columnTypes:z.array(z.string()),columns:z.array(z.string()),rows:z.array(z.array(z.unknown())),truncated:z.boolean(),executionPath:z.literal('staged'),queryEngineVersion:z.string(),policyVersion:z.number(),
 treatmentEvidence:z.strictObject({aggregateMinGroupSize:z.number(),stage2Required:z.boolean(),stage2Ran:z.boolean()})});
export const validationResponse=z.strictObject({queryEngineVersion:z.string(),treatmentEvidence:executionResponse.shape.treatmentEvidence});

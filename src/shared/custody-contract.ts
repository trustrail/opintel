import { z } from 'zod';
export const keyVersion = z.number().int().positive().safe();
export const sentinel = z.string().regex(/^v1_sentinel_[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$(?![\s\S])/u);
export const custodyEnvelope = z.strictObject({ requestId:z.string().min(1), projectId:z.uuid(), payload:z.unknown() });
export const keyResult = z.strictObject({ keyVersion, sentinelToken:sentinel });
export const candidate = keyResult.extend({ candidateId:z.uuid() });
export const custodyOperations = {
 initialize:{request:z.strictObject({}),response:keyResult.extend({created:z.boolean()})},
 'rotate/prepare':{request:z.strictObject({expectedCurrentVersion:keyVersion}),response:candidate},
 'restore/prepare':{request:z.strictObject({keyVersion}),response:candidate},
 'rotate/commit':{request:z.strictObject({candidateId:z.uuid()}),response:keyResult},
 'restore/commit':{request:z.strictObject({candidateId:z.uuid()}),response:keyResult},
 rehearse:{request:z.strictObject({}),response:z.strictObject({results:z.array(z.discriminatedUnion('outcome',[
  keyResult.extend({outcome:z.literal('derived')}),
  z.strictObject({keyVersion,outcome:z.literal('failed'),category:z.enum(['escrow_unreadable','escrow_missing','malformed'])}),
 ]))})},
 status:{request:z.strictObject({}),response:z.strictObject({currentVersion:keyVersion.nullable(),versions:z.array(z.strictObject({keyVersion,inStore:z.boolean(),inEscrow:z.boolean()}))})},
} as const;
export type CustodyOperation=keyof typeof custodyOperations;
export type CustodyResponse<K extends CustodyOperation>=z.infer<(typeof custodyOperations)[K]['response']>;
export const TokenKeyView=z.object({currentVersion:keyVersion.nullable(),versions:z.array(z.object({
 version:keyVersion,state:z.enum(['current','retired']),createdAt:z.iso.datetime({offset:true}),
 createdBy:z.object({id:z.uuid(),email:z.string()}).nullable(),reason:z.string().nullable(),
 backupVerifiedAt:z.iso.datetime({offset:true}).nullable(),lastRehearsedAt:z.iso.datetime({offset:true}).nullable(),lastRehearsal:z.enum(['ok','mismatch','failed']).nullable(),
}))});
export type TokenKeyView=z.infer<typeof TokenKeyView>;
export const custodyMessages={
 read:'Token key primary-store read failed. Restore the recorded key; do not initialize a replacement.',
 generate:'Token key generation failed. Retry custody initialization.',
 store:'Token key primary-store write failed. Check the configured key store and retry.',
 escrow:'Token key escrow write failed. Check the configured backup location and retry.',
 verify:'Token key backup verification failed. Check escrow readability and integrity before connecting a source.',
 state:'Token key custody metadata could not be saved or read. Check the sidecar custody directory.',
 conflict:'The custody candidate is unknown, expired, already used, or its current version has changed. Prepare the operation again.',
 restore:'Token key restore failed. Check the primary store; the retained escrow version has not been deleted.',
 busy:'Another custody operation is in progress. Retry after it finishes.',
 mismatch:'The escrow sentinel does not match the recorded key version. The key was not restored.',
} as const;
export function safeCustodyMessage(value:string):string {return Object.values(custodyMessages).find(message=>message===value)??'The sidecar custody operation failed. Check its storage availability and retry.';}

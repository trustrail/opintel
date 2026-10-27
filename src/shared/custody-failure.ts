import {z} from 'zod';
/** Bounded provider diagnostics. No raw body, URL, credential or native message. */
const count=z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const punctuation=z.string().regex(/^[!-/:-@[-`{-~]$/u);
const keySignature=z.strictObject({nonAlphanumeric:z.array(z.union([punctuation,z.literal('other')])).max(33),firstClass:z.enum(['empty','upper','lower','digit','punctuation','other']),doubledPunctuation:z.array(punctuation).max(32)});
export const custodyRequestShape=z.strictObject({encoding:z.enum(['json','text']),fieldCount:count.optional(),keyCharacters:count.nullable().optional(),keySignature:keySignature.optional(),recipientCharacters:count.nullable().optional(),expiresHours:z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable().optional(),singleUse:z.boolean().nullable().optional(),storageType:z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER).nullable().optional(),receiptCharacters:count.nullable().optional()});
export const custodyEscrowRequest=z.strictObject({type:z.literal('escrow-request'),startedAt:z.iso.datetime(),completedAt:z.iso.datetime(),evidenceId:z.uuid().nullable(),subcall:z.enum(['subscription','validation','other']),requestBytes:count,requestShape:custodyRequestShape,attempt:z.number().int().min(1).max(2),status:z.number().int().min(100).max(599).nullable(),written:z.boolean()});
const callDiagnostic={subcall:z.enum(['subscription','validation','other']).optional(),providerCode:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,47}$/u).nullable().optional(),attempt:z.number().int().min(1).max(2).optional(),requestBytes:count.optional(),requestShape:custodyRequestShape.optional()};
export const custodyProviderFailure=z.discriminatedUnion('kind',[
 z.strictObject({...callDiagnostic,kind:z.literal('http_refused'),status:z.number().int().min(100).max(599),responseBody:z.strictObject({text:z.string().max(2048),truncated:z.boolean()}).optional()}),
 z.strictObject({...callDiagnostic,kind:z.enum(['unreachable','deadline_exceeded','operation_refused','invalid_response','worker_failed','worker_exited','worker_deadline_exceeded'])}),
]);
export const custodyFailureCode=z.enum(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EPIPE','08003','08006','23503','23505','40001','40P01','53300','57P01','57014']);
export const custodyFailureType=z.enum(['Error','TypeError','RangeError','SyntaxError','ReferenceError','URIError','EvalError','CustodyProviderError']);
export const custodyFailure=z.strictObject({
 phase:z.enum(['credential_association','escrow','grant_issue']),provider:z.enum(['local','xq','other']),
 // Strip historical stack/message properties on read, without rewriting evidence.
 exception:z.object({type:custodyFailureType.nullable().catch(null),code:custodyFailureCode.nullable().catch(null)}),
 providerFailure:custodyProviderFailure.nullable(),
});

import {z} from 'zod';
/** Operator evidence only. No provider body, URL, credential or native message. */
export const custodyProviderFailure=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('http_refused'),status:z.number().int().min(100).max(599)}),
 z.strictObject({kind:z.enum(['unreachable','deadline_exceeded','operation_refused','invalid_response','worker_failed','worker_exited','worker_deadline_exceeded'])}),
]);
export const custodyFailureCode=z.enum(['ECONNRESET','ECONNREFUSED','ETIMEDOUT','ENOTFOUND','EAI_AGAIN','EPIPE','08003','08006','23503','23505','40001','40P01','53300','57P01','57014']);
export const custodyFailure=z.strictObject({
 phase:z.enum(['credential_association','escrow','grant_issue']),provider:z.enum(['local','xq','other']),
 exception:z.strictObject({type:z.string(),code:custodyFailureCode.nullable(),stack:z.array(z.string())}),
 providerFailure:custodyProviderFailure.nullable(),
});

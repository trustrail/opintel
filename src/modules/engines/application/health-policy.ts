import {z} from 'zod';

export const engineHealthPolicySchema=z.strictObject({
 maxAgeMs:z.number().int().min(1).max(2147483647).default(30000),
 refreshMs:z.number().int().min(1).max(2147483647).default(5000),
 heartbeatMaxAgeMs:z.number().int().min(1).max(2147483647).default(15000),
 reuseEnabled:z.boolean().default(false),
}).refine(v=>v.refreshMs<v.maxAgeMs,'Engine health refresh must precede expiry.');
export type EngineHealthPolicy=z.infer<typeof engineHealthPolicySchema>;

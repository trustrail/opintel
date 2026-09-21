import { z } from 'zod';
import { DomainError, err, ok, type Result } from '../../src/shared/kernel/index.js';
export const tokenConfigSchema=z.strictObject({
 domain:z.string().regex(/^[a-z0-9]+$/u),canonId:z.string().regex(/^[a-z0-9]+$/u),
 mode:z.enum(['text','number','date','timestamp']),caseInsensitive:z.boolean().default(true),
 declaredZone:z.string().min(1).nullable().optional(),epochUnit:z.enum(['seconds','milliseconds']).optional(),
});
export type TokenConfig=z.infer<typeof tokenConfigSchema>;
export interface Canonicaliser {readonly canonId:string;canonicalise(raw:string):string;}
export interface ZoneResolver {toUtc(localSeconds:number,zone:string):Result<number>;}
export function validateTokenConfig(input:unknown):Result<TokenConfig>{const result=tokenConfigSchema.safeParse(input);return result.success?ok(result.data):err(new DomainError('validation_failed','Tokenization requires a valid mode and non-empty lowercase alphanumeric domain and canonicaliser identifiers.'));}

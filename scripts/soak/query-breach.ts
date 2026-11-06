import {z} from 'zod';

const capacityOutcome=z.object({outcome:z.literal('engine_saturated'),cause:z.literal('engine_saturated').optional(),rowCount:z.undefined().optional()});
export const isCapacityOutcome=(value:unknown)=>capacityOutcome.safeParse(value).success;
const refusal=z.object({isError:z.literal(true),structuredContent:z.undefined().optional(),_meta:z.object({code:z.string(),cause:z.string().optional(),releaseFailure:z.undefined().optional()})});
export function isCapacityRefusal(value:unknown){const parsed=refusal.safeParse(value);return parsed.success&&isCapacityOutcome({outcome:parsed.data._meta.code,cause:parsed.data._meta.cause});}

const escrowRefusal=z.object({isError:z.literal(true),_meta:z.object({releaseFailure:z.object({phase:z.literal('escrow')})})});
/** Every failed escrow is a breach, even an exploratory query without an oracle.
 * A declared mismatch still enters coverage, but must not double-count the call. */
export function queryOutcomeBreach(response:unknown,mismatch?:'Retiring credential outcome mismatch'|'Declared scenario outcome mismatch'){
 return escrowRefusal.safeParse(response).success?'Escrow failed':isCapacityRefusal(response)?undefined:mismatch;
}

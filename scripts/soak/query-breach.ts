import {z} from 'zod';

const escrowRefusal=z.object({isError:z.literal(true),_meta:z.object({releaseFailure:z.object({phase:z.literal('escrow')})})});
/** Every failed escrow is a breach, even an exploratory query without an oracle.
 * A declared mismatch still enters coverage, but must not double-count the call. */
export function queryOutcomeBreach(response:unknown,mismatch?:'Retiring credential outcome mismatch'|'Declared scenario outcome mismatch'){
 return escrowRefusal.safeParse(response).success?'Escrow failed':mismatch;
}

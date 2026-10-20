import type {z} from 'zod';
import type {custodyProviderFailure} from '../../../shared/custody-failure.js';
/** Structured adapter failure; its payload contains only bounded diagnostics. */
export class CustodyProviderError extends Error {
 constructor(readonly failure:z.infer<typeof custodyProviderFailure>){super('Custody provider operation failed.');}
}

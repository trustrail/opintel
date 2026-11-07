import {z} from 'zod';
/** One measured window; delayed sampling is reported with its actual duration. */
export const EngineRuntimeSample=z.strictObject({sampledAt:z.iso.datetime(),windowMs:z.number().nonnegative(),samples:z.number().int().nonnegative(),eventLoop:z.strictObject({meanMs:z.number().nonnegative().nullable(),p99Ms:z.number().nonnegative().nullable(),maxMs:z.number().nonnegative().nullable()})});
export type EngineRuntimeSample=z.infer<typeof EngineRuntimeSample>;

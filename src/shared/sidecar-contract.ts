import { z } from 'zod';
import { Timestamp } from './kernel/index.js';

const count = z.number().int().nonnegative().safe();
export const healthResponse = z.strictObject({ version: z.string().regex(/^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/), contract: count, duckdb: z.string() });
export const connectionResponse = z.union([
  z.strictObject({ reachable: z.literal(true) }),
  z.strictObject({ reachable: z.literal(false), reason: z.string().min(1) }),
]);
export const snapshotResponse = z.strictObject({ snapshot: z.strictObject({
  takenAt: z.iso.datetime().transform((value) => Timestamp(new Date(value))),
  objects: z.array(z.strictObject({
    schema: z.string(), name: z.string(), kind: z.enum(['table', 'view', 'fileset']), rowEstimate: count.nullable(),
    columns: z.array(z.strictObject({
      sourceIdentifier: z.string(), stableRef: z.string().nullable(), ordinal: count,
      sourceType: z.string(), nullable: z.boolean(), isKey: z.boolean(), description: z.string().nullable(),
    })),
  })),
  foreignKeys: z.array(z.strictObject({ fromObject: z.string(), fromColumn: z.string(), toObject: z.string(), toColumn: z.string() })),
}) });
export const sampleResponse = z.strictObject({ values: z.record(z.uuid(), z.array(z.strictObject({ value: z.string(), frequency: count }))) });
export const estimateResponse = z.strictObject({ rows: count.nullable() });
export const samplePayload = z.strictObject({
  consentGiven: z.literal(true),
  elements: z.array(z.strictObject({ elementId: z.uuid(), schema: z.string().min(1), object: z.string().min(1), column: z.string().min(1) })),
  limit: z.number().int().positive().safe(),
});
export const introspectPayload = z.strictObject({ include: z.array(z.string()) });
export const estimatePayload = z.strictObject({ object: z.strictObject({ schema: z.string(), name: z.string() }) });
export const envelope = z.strictObject({
  requestId: z.string().min(1), projectId: z.uuid(), sourceId: z.uuid(),
  credentialRef: z.string().startsWith('vault://').min(9), payload: z.unknown(),
});

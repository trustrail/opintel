import { z } from 'zod';
import { errorCodeSchema } from '../../src/shared/error-contract.js';
// Only fixed categories and identifiers cross the telemetry boundary. Never
// accept exception messages, filenames, column names, or customer values.
const categories = z.union([errorCodeSchema, z.enum(['filesystem_unavailable', 'timeout', 'unknown'])]);
export function ingestErrorCategory(error: unknown): z.infer<typeof categories> {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  const parsed = categories.safeParse(code);
  if (parsed.success) return parsed.data;
  if (typeof code === 'string' && ['ENOENT', 'EACCES', 'EPERM', 'EIO', 'ENOSPC'].includes(code)) return 'filesystem_unavailable';
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR') return 'timeout';
  return 'unknown';
}
const fields = z.object({
  event: z.enum(['ingest.quarantined', 'ingest.scan_failed', 'ingest.notice_failed', 'ingest.reconciliation_failed']),
  timestamp: z.iso.datetime(), sourceId: z.uuid().optional(), projectId: z.uuid().optional(), filingId: z.uuid().optional(),
  errorCategory: categories.optional(), attemptCount: z.number().int().positive().optional(),
});
export function ingestAttributes(input: unknown): Record<string, string | number> { return fields.parse(input); }
export function ingestEvent(input: unknown): void {
  const record = typeof input === 'object' && input !== null ? input : {};
  console.info(ingestAttributes({ ...record, timestamp: new Date().toISOString() }));
}

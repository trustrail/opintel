import { z } from 'zod';
// Shared filtering for log records and span attributes. Unknown fields are
// removed even if a caller supplies an entire filing or a driver exception.
const fields = z.object({ event: z.enum(['ingest.quarantined', 'ingest.scan_failed', 'ingest.notice_failed', 'ingest.reconciliation_failed']), filingId: z.uuid().optional() });
export function ingestAttributes(input: unknown): Record<string, string> { return fields.parse(input); }
export function ingestEvent(input: unknown): void { console.info(ingestAttributes(input)); }

import type { ErrorCode } from './kernel/types.js';
// Only reviewed, value-free text crosses the sidecar boundary unchanged.
// Never trust an arbitrary driver/peer exception merely because it has a code.
export const sourceMessages = {
  cancelled: 'Source preparation was interrupted. Retry to continue from the existing source.',
  unexpected: 'Source preparation could not finish. Check the Opintel Engine and source connection, then retry.',
} as const;
const fallback: Partial<Record<ErrorCode,string>> = {
  forbidden: 'This source operation is not permitted. Check the required permission or sampling consent before retrying.',
  validation_failed: 'The source configuration is invalid. Check the prepared configuration before retrying.',
  conflict: 'The source operation conflicts with existing state. Ask the deployment operator to inspect the source and local register before retrying.',
  not_found: 'The source was not found. Check the project before retrying.',
  source_unavailable: 'The source could not be reached. Check its connection and credentials, then retry.',
  dependency_unavailable: 'A source dependency is unavailable. Check the Opintel Engine, secret-store configuration and receipt listener, then retry.',
  object_unavailable: 'The source object is unavailable. Check the selected schemas and source permissions, then retry.',
  budget_exceeded: 'The source connection limit was reached. Wait for active operations to finish, then retry.',
};
const reviewed = new Set<string>([...Object.values(sourceMessages), ...Object.values(fallback),
  'Source authentication failed.', 'Source connection timed out.', 'Source connection failed.',
  'Source request cancelled.', 'Sampling requires source consent.']);
export function safeSourceMessage(code: ErrorCode, message: string): string {
  return reviewed.has(message) ? message : fallback[code] ?? sourceMessages.unexpected;
}

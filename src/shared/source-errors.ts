import type { ErrorCode } from './kernel/types.js';
// Only reviewed, value-free text crosses the sidecar boundary unchanged.
// Never trust an arbitrary driver/peer exception merely because it has a code.
export const sourceMessages = {
  unprepared: 'The industry pack is not provisioned for this project. Ask the deployment operator to prepare it.',
  templateConflict: 'This landing zone was prepared with a different demo template. Ask the deployment operator to restore the matching template before retrying.',
  deliveryConflict: 'A demo delivery conflicts with an existing file. Ask the deployment operator to inspect the local register before retrying.',
  deploymentInvalid: 'The demo landing zone or credential does not match its preparation. Ask the deployment operator to prepare this project again, then retry.',
  localeInvalid: 'The demo locale does not match the prepared filing rules. Ask the deployment operator to update the rule snapshot, then retry.',
  demoRulesInvalid: 'Demo filing rules could not be read or validated. Ask the deployment operator to repair the prepared rule snapshot, then retry.',
  demoDependencyPending: 'A prerequisite demo filing has not been registered yet. Resume the landing watcher, then retry; existing arrivals will be preserved.',
  demoRegisterUnavailable: 'The demo arrival register could not be read or validated. Ask the deployment operator to restore the register, then retry without deleting arrivals.',
  demoWriteFailed: 'Demo files could not be written to the landing zone. Ask the deployment operator to check write permissions and available storage, then retry.',
  demoUnexpected: 'Demo provisioning stopped because of an unexpected internal error. Contact the deployment operator, then retry; existing arrivals will be preserved.',
  landingWait: 'Demo files have not finished registering. Check the sidecar and receipt listener, then retry; existing arrivals will be preserved.',
  cancelled: 'Source preparation was interrupted. Retry to continue from the existing source.',
  unexpected: 'Source preparation could not finish. Check the sidecar and source connection, then retry.',
} as const;
const fallback: Partial<Record<ErrorCode,string>> = {
  forbidden: 'This source operation is not permitted. Check the required permission or sampling consent before retrying.',
  validation_failed: 'The source configuration is invalid. Check the prepared configuration before retrying.',
  conflict: 'The source operation conflicts with existing state. Ask the deployment operator to inspect the source and local register before retrying.',
  not_found: 'The source or demo preparation was not found. Check the project preparation before retrying.',
  source_unavailable: 'The source could not be reached. Check its connection and credentials, then retry.',
  dependency_unavailable: 'A source dependency is unavailable. Check the sidecar, secret-store configuration and receipt listener, then retry.',
  object_unavailable: 'The source object is unavailable. Check the selected schemas and source permissions, then retry.',
  budget_exceeded: 'The source connection limit was reached. Wait for active operations to finish, then retry.',
};
const reviewed = new Set<string>([...Object.values(sourceMessages), ...Object.values(fallback),
  'Source authentication failed.', 'Source connection timed out.', 'Source connection failed.',
  'Source request cancelled.', 'Sampling requires source consent.']);
export function safeSourceMessage(code: ErrorCode, message: string): string {
  return reviewed.has(message) ? message : fallback[code] ?? sourceMessages.unexpected;
}

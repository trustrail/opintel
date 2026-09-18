import { DomainError, InvariantViolation, err, ok, type Result } from '../../../shared/kernel/index.js';

export const runStates = ['queued', 'connecting', 'reading', 'diffing', 'complete', 'failed', 'cancelled'] as const;
export type IntrospectionState = typeof runStates[number];
export const transitions: Readonly<Record<IntrospectionState, readonly IntrospectionState[]>> = {
  queued: ['connecting', 'cancelled'], connecting: ['reading', 'failed', 'cancelled'],
  reading: ['diffing', 'failed', 'cancelled'], diffing: ['complete', 'failed'],
  complete: [], failed: [], cancelled: [],
};
export function transitionRun(from: IntrospectionState, to: IntrospectionState): Result<IntrospectionState> {
  return transitions[from].includes(to) ? ok(to) : err(new DomainError('conflict', `Cannot transition introspection from ${from} to ${to}.`));
}
export function enforceTransition(from: IntrospectionState, to: IntrospectionState, production: boolean,
  log: (from: IntrospectionState, to: IntrospectionState) => void): boolean {
  if (transitionRun(from, to).ok) return true;
  if (!production) throw new InvariantViolation('IntrospectionTransition', { from, to });
  log(from, to);
  return false;
}

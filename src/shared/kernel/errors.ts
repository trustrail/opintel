import type { ErrorCode, JsonObject } from './types.js';

export class InvariantViolation extends Error {
  readonly code = 'invariant_violation' as const;

  constructor(readonly invariant: string, readonly received: unknown) {
    super(`Invariant violated: ${invariant}`);
    this.name = 'InvariantViolation';
  }
}

export class DomainError {
  constructor(
    readonly code: ErrorCode,
    readonly message: string,
    readonly details?: JsonObject,
    readonly retryable = false,
  ) {}
}

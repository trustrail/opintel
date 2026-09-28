import { DomainError } from '../../../src/shared/kernel/index.js';

/** Native diagnostics may contain SQL fragments and values. Classify known
 * resource failures, but never forward the diagnostic itself or its cause. */
export function sessionFailure(error:unknown):DomainError{
 const message=error instanceof Error?error.message:'';
 if(message.startsWith('Out of Memory Error:'))return new DomainError('budget_exceeded',
  'Out of Memory Error: the pool memory limit was exceeded. Narrow the query or ask an administrator to review the limit.',
  {resource:'memory'},false);
 if(message.startsWith('Interrupt Error:'))return new DomainError('budget_exceeded',
  'The query was cancelled before completion. No partial result was returned.',{resource:'cancellation'},false);
 return new DomainError('dependency_unavailable','The query engine could not complete the operation. No partial result was returned.',undefined,true);
}

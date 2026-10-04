import { ZodError } from 'zod';

/** Startup failures retain native type/message for operator diagnosis.
 * Schema field diagnostics retain the reviewed value-redaction policy. */
export class StartupCheckError extends Error {
  readonly code: string | undefined;
  constructor(check: string, reason: string, options?: ErrorOptions) {
    super(`Opintel Engine startup failed: ${check}: ${reason}`, options);
    this.name = 'StartupCheckError';
    const cause = options?.cause;
    this.code = typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined;
  }
}

const reasons: Readonly<Record<string, string>> = {
  ENOENT: 'the configured file or directory does not exist.',
  ENOTDIR: 'a configured path component is not a directory.',
  EISDIR: 'the configured file is a directory.',
  EACCES: 'permission denied.', EPERM: 'operation not permitted.',
  EEXIST: 'the state lock already exists. Confirm the previous Opintel Engine has stopped before removing the stale lock.',
  EADDRINUSE: 'the address and port are already in use.',
  EADDRNOTAVAIL: 'the listen address is not available on this host.',
  ENOSPC: 'the filesystem has no space left.', EROFS: 'the filesystem is read-only.',
  EMFILE: 'the process has too many open files.', EIO: 'filesystem I/O failed.',
};

export async function startupCheck<T>(check: string, work: () => T | Promise<T>, fallback = ''): Promise<T> {
  try { return await work(); }
  catch (error) {
    if (error instanceof StartupCheckError) throw error;
    const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : '';
    const reason = error instanceof ZodError
      ? `invalid configuration fields: ${error.issues.map(issue => issue.path.join('.')).join(', ')}.`
      : error instanceof SyntaxError ? 'the file is not valid JSON.' : reasons[code] ?? fallback;
    const diagnostic = error instanceof ZodError || error instanceof SyntaxError
      ? `${error.name}: ${reason}`
      : error instanceof Error ? `${error.name}: ${error.message || '<empty message>'}`
      : `${typeof error}: ${String(error)}`;
    throw new StartupCheckError(check, [reason,diagnostic].filter(Boolean).join(' '), { cause: error });
  }
}

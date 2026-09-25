import { describe, expect, it, vi } from 'vitest';
import { EnvironmentSecretStore, SecretRef } from '../src/platform/secrets/index.js';

const ref = SecretRef('secret://opintel/idp/company/google');
const secret = 'never-log-this-secret';

describe('environment secret store', () => {
  it('accepts the neutral scheme and refuses a legacy scheme or literal', () => {
    expect(SecretRef('secret://customer/source')).toBe('secret://customer/source');
    expect(() => SecretRef('vault://customer/source')).toThrow();
    expect(() => SecretRef('plaintext')).toThrow();
  });

  it('resolves an environment value for an IdP reference', async () => {
    const secrets = new EnvironmentSecretStore({ OPINTEL_SECRET_OPINTEL_IDP_COMPANY_GOOGLE: secret });

    await expect(secrets.resolve(ref)).resolves.toBe(secret);
  });

  it('refuses a missing reference without rendering a secret value', async () => {
    const secrets = new EnvironmentSecretStore({});

    await expect(secrets.resolve(ref)).rejects.toMatchObject({
      code: 'dependency_unavailable',
      message: 'Secret secret://opintel/idp/company/google is not configured.',
      retryable: true,
    });
  });

  it('never logs a resolved secret', async () => {
    const log = vi.spyOn(console, 'log');
    const info = vi.spyOn(console, 'info');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const secrets = new EnvironmentSecretStore({ OPINTEL_SECRET_OPINTEL_IDP_COMPANY_GOOGLE: secret });

    await secrets.resolve(ref);

    for (const output of [log, info, warn, error]) {
      expect(output.mock.calls.flat().join(' ')).not.toContain(secret);
      output.mockRestore();
    }
  });
});

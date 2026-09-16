import { describe, expect, it, vi } from 'vitest';
import { DevelopmentVaultAdapter, VaultRef } from '../src/platform/vault/index.js';

const ref = VaultRef('vault://opintel/idp/company/google');
const secret = 'never-log-this-secret';

describe('development vault adapter', () => {
  it('resolves an environment value for an IdP reference', async () => {
    const vault = new DevelopmentVaultAdapter({ OPINTEL_SECRET_OPINTEL_IDP_COMPANY_GOOGLE: secret });

    await expect(vault.resolve(ref)).resolves.toBe(secret);
  });

  it('refuses a missing reference without rendering a secret value', async () => {
    const vault = new DevelopmentVaultAdapter({});

    await expect(vault.resolve(ref)).rejects.toMatchObject({
      code: 'dependency_unavailable',
      message: 'Secret vault://opintel/idp/company/google is not configured.',
      retryable: true,
    });
  });

  it('never logs a resolved secret', async () => {
    const log = vi.spyOn(console, 'log');
    const info = vi.spyOn(console, 'info');
    const warn = vi.spyOn(console, 'warn');
    const error = vi.spyOn(console, 'error');
    const vault = new DevelopmentVaultAdapter({ OPINTEL_SECRET_OPINTEL_IDP_COMPANY_GOOGLE: secret });

    await vault.resolve(ref);

    for (const output of [log, info, warn, error]) {
      expect(output.mock.calls.flat().join(' ')).not.toContain(secret);
      output.mockRestore();
    }
  });
});

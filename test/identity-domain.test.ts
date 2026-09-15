import { describe, expect, it } from 'vitest';
import { UserId } from '../src/shared/kernel/index.js';
import { UserAccount } from '../src/modules/identity/domain/user-account.js';

describe('identity domain', () => {
  it('refuses an unverified identity claim', () => {
    const account = new UserAccount(UserId('018f8f9d-7f83-7abc-8def-0123456789ab'), 'person@example.com');
    const result = account.link({ provider: 'oidc:google', providerSubject: 'subject', emailVerified: false });
    expect(result.ok).toBe(false);
    expect(account.linkedIdentities()).toEqual([]);
  });

  it('links a verified identity once', () => {
    const account = new UserAccount(UserId('018f8f9d-7f83-7abc-8def-0123456789ab'), 'person@example.com');
    const identity = { provider: 'oidc:google', providerSubject: 'subject', emailVerified: true };
    expect(account.link(identity).ok).toBe(true);
    expect(account.link(identity).ok).toBe(false);
    expect(account.linkedIdentities()).toEqual([identity]);
  });
});

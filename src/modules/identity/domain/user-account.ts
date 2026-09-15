import { DomainError, err, ok, type Result, type UserId } from '../../../shared/kernel/index.js';

export type UserIdentity = {
  provider: string;
  providerSubject: string;
  emailVerified: boolean;
};

export class UserAccount {
  private readonly identities: UserIdentity[] = [];

  constructor(readonly id: UserId, readonly email: string) {}

  link(identity: UserIdentity): Result<void, DomainError> {
    if (!identity.emailVerified) {
      return err(new DomainError('validation_failed', 'An identity email must be verified.'));
    }
    if (this.identities.some((current) => current.provider === identity.provider && current.providerSubject === identity.providerSubject)) {
      return err(new DomainError('conflict', 'This identity is already linked.'));
    }
    this.identities.push(identity);
    return ok(undefined);
  }

  linkedIdentities(): readonly UserIdentity[] {
    return [...this.identities];
  }
}

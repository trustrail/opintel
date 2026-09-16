import type { SessionId, Timestamp, UserId } from '../../../shared/kernel/index.js';
import type { AuthMethod, SessionPort } from './session.js';

export type CurrentUser = {
  readonly id: UserId;
  readonly email: string;
  readonly fullName: string | null;
  readonly timezone: string;
  readonly method: AuthMethod;
  readonly sessionCreatedAt: Timestamp;
  readonly deviceConfirmed: boolean;
};

export type CurrentUserAccount = {
  readonly id: UserId;
  readonly email: string;
  readonly fullName: string | null;
  readonly timezone: string;
};

export interface CurrentUserRepository {
  findById(id: UserId): Promise<CurrentUserAccount | null>;
}

export class CurrentUserService {
  constructor(
    private readonly sessions: SessionPort,
    private readonly accounts: CurrentUserRepository,
  ) {}

  async read(sessionId: SessionId): Promise<CurrentUser | null> {
    const session = await this.sessions.read(sessionId);
    if (session === null) return null;
    const account = await this.accounts.findById(session.userId);
    if (account === null) return null;
    await this.sessions.touch(sessionId);
    return {
      id: account.id,
      email: account.email,
      fullName: account.fullName,
      timezone: account.timezone,
      method: session.method,
      sessionCreatedAt: session.createdAt,
      deviceConfirmed: session.deviceConfirmed,
    };
  }
}

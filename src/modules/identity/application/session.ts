import type { SessionId, Timestamp, UserId } from '../../../shared/kernel/index.js';

export type AuthMethod = 'magic_link' | `oidc:${string}`;

export type SessionMeta = {
  ip: string;
  userAgent: string;
  deviceNonce: string;
};

export type SessionRecord = {
  userId: UserId;
  method: AuthMethod;
  createdAt: Timestamp;
  lastSeenAt: Timestamp;
  deviceConfirmed: boolean;
  meta: SessionMeta;
};

export type SessionSummary = {
  id: SessionId;
  meta: SessionMeta;
  lastSeenAt: Timestamp;
  current: boolean;
};

export interface SessionPort {
  create(user: UserId, meta: SessionMeta, method: AuthMethod, deviceConfirmed: boolean): Promise<SessionId>;
  read(id: SessionId): Promise<SessionRecord | null>;
  touch(id: SessionId): Promise<void>;
  rotate(id: SessionId): Promise<SessionId>;
  revoke(id: SessionId): Promise<void>;
  revokeAllFor(user: UserId, except?: SessionId): Promise<number>;
  listFor(user: UserId): Promise<SessionSummary[]>;
}

export function markCurrentSession(sessions: readonly SessionSummary[], currentId: SessionId): SessionSummary[] {
  return sessions.map((session) => ({ ...session, current: session.id === currentId }));
}

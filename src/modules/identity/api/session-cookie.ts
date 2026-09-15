import type { SessionId } from '../../../shared/kernel/index.js';

export const sessionCookieName = 'opintel_session';

export function sessionCookie(sessionId: SessionId): string {
  return `${sessionCookieName}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

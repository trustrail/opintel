import { z } from 'zod';
import { SessionId } from '../../../shared/kernel/index.js';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { type CurrentUserService } from '../application/current-user.js';
import { sessionCookieName } from './session-cookie.js';

const emptyParams = z.object({});
const emptyRequest = z.undefined();
const currentUserResponse = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  fullName: z.string().nullable(),
  timezone: z.string(),
  method: z.string(),
  sessionCreatedAt: z.string(),
  deviceConfirmed: z.boolean(),
});

function cookieValue(cookie: string | undefined, name: string): string | null {
  if (cookie === undefined) return null;
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return null;
}

function sessionIdFromCookie(cookie: string | undefined): ReturnType<typeof SessionId> | null {
  const value = cookieValue(cookie, sessionCookieName);
  if (value === null) return null;
  try {
    return SessionId(value);
  } catch {
    return null;
  }
}

export function currentUserRoutes(service: CurrentUserService) {
  return [defineRoute({
    method: 'GET', path: '/api/v1/auth/me', params: emptyParams,
    permission: 'authenticated',
    request: emptyRequest, response: z.union([currentUserResponse, errorEnvelopeSchema]),
    handle: async (request) => {
      const sessionId = sessionIdFromCookie(request.headers.cookie);
      const user = sessionId === null ? null : await service.read(sessionId);
      if (user === null) {
        return {
          status: 401,
          body: {
            error: {
              code: 'unauthenticated',
              message: 'Sign in is required.',
              requestId: request.requestId,
              retryable: false,
            },
          },
        };
      }
      return { body: user };
    },
  })];
}

export { cookieValue };

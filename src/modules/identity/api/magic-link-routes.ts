import { z } from 'zod';
import { defineRoute, errorEnvelopeSchema } from '../../../platform/http/index.js';
import { requestLinkEmailSchema } from '../../../shared/api/index.js';
import { sessionCookie } from './session-cookie.js';
import { MagicLinkService } from '../application/magic-link.js';

const emptyParams = z.object({});
const requestLinkBody = z.object({ email: requestLinkEmailSchema, deviceNonce: z.string().min(1) });
const callbackBody = z.object({ token: z.string().min(1), deviceNonce: z.string().min(1) });
const confirmBody = callbackBody.extend({ confirm: z.boolean() });
const callbackResponse = z.object({ deviceMismatch: z.boolean() });

function requestMetadata(headers: Readonly<Record<string, string | string[] | undefined>>): { ip: string | null; userAgent: string } {
  const forwarded = headers['x-forwarded-for'];
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const userAgent = headers['user-agent'];
  return { ip: ip ?? null, userAgent: Array.isArray(userAgent) ? userAgent[0] ?? 'unknown' : userAgent ?? 'unknown' };
}

export function magicLinkRoutes(service: MagicLinkService) {
  return [
    defineRoute({
      method: 'POST', path: '/api/v1/auth/request-link', params: emptyParams,
      permission: 'public',
      request: requestLinkBody, response: z.union([z.undefined(), errorEnvelopeSchema]),
      handle: async (request) => {
        const result = await service.requestLink({ ...request.body, ip: requestMetadata(request.headers).ip });
        if (result.allowed) return { status: 202, body: undefined };
        return { status: 429, headers: { 'retry-after': String(result.retryAfterSeconds) }, body: { error: { code: 'rate_limited', message: 'Too many requests. Try again later.', details: { retryAfter: result.retryAfterSeconds }, requestId: request.requestId, retryable: true } } };
      },
    }),
    defineRoute({
      method: 'POST', path: '/api/v1/auth/callback', params: emptyParams,
      permission: 'public',
      request: callbackBody, response: callbackResponse,
      handle: async (request) => {
        const meta = requestMetadata(request.headers);
        const result = await service.callback({ ...request.body, ip: meta.ip ?? 'unknown', userAgent: meta.userAgent });
        if (result.kind === 'session') return { headers: { 'set-cookie': sessionCookie(result.sessionId) }, body: { deviceMismatch: false } };
        return { body: { deviceMismatch: result.kind === 'device_mismatch' } };
      },
    }),
    defineRoute({
      method: 'POST', path: '/api/v1/auth/confirm-device', params: emptyParams,
      permission: 'public',
      request: confirmBody, response: callbackResponse,
      handle: async (request) => {
        const meta = requestMetadata(request.headers);
        const result = await service.confirm({ ...request.body, ip: meta.ip ?? 'unknown', userAgent: meta.userAgent });
        if (result.kind === 'session') return { headers: { 'set-cookie': sessionCookie(result.sessionId) }, body: { deviceMismatch: false } };
        return { body: { deviceMismatch: false } };
      },
    }),
  ];
}

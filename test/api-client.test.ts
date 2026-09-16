import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApiClient, type ApiFetcher } from '../src/shared/api/index.js';

function response(body: string, status: number, requestId: string | null): Response {
  return new Response(body, {
    status,
    headers: requestId === null ? {} : { 'x-request-id': requestId },
  });
}

describe('shared API client', () => {
  it('returns validated data and exposes the request id', async () => {
    const fetcher: ApiFetcher = async () => response('{"accepted":true}', 202, 'req-accepted');
    const result = await createApiClient(fetcher).request({
      path: '/api/v1/example',
      method: 'POST',
      body: { accepted: true },
      response: z.object({ accepted: z.literal(true) }),
    });

    expect(result).toEqual({ ok: true, value: { accepted: true }, requestId: 'req-accepted' });
  });

  it('parses the documented error envelope into an AppError', async () => {
    const fetcher: ApiFetcher = async () => response(JSON.stringify({
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Try again later.',
        details: { retryAfter: 12 },
        requestId: 'req-limited',
        retryable: true,
      },
    }), 429, 'req-limited');

    const result = await createApiClient(fetcher).request({ path: '/api/v1/example', response: z.undefined() });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'rate_limited',
        message: 'Too many requests. Try again later.',
        details: { retryAfter: 12 },
        requestId: 'req-limited',
        retryable: true,
      },
    });
  });

  it('normalizes a network failure into a retryable AppError', async () => {
    const fetcher: ApiFetcher = async () => Promise.reject(new TypeError('network unavailable'));
    const result = await createApiClient(fetcher).request({ path: '/api/v1/example', response: z.undefined() });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'dependency_unavailable',
        message: 'The service could not be reached. Try again.',
        requestId: null,
        retryable: true,
      },
    });
  });
});

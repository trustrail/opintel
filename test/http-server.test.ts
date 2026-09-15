import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createHttpServer, requestIdHeader, type HttpEndpoint } from '../src/platform/http/index.js';

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).filter((server) => server.listening).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

async function request<TRequest, TResponse>(endpoint: HttpEndpoint<TRequest, TResponse>, body: unknown): Promise<Response> {
  const server = createHttpServer(endpoint, { requestIdFactory: () => 'req-test' });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind to TCP.');

  return fetch(`http://127.0.0.1:${(address as AddressInfo).port}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('HTTP server boundaries', () => {
  it('returns the validation_failed envelope for an invalid request body', async () => {
    const response = await request({
      request: z.object({ email: z.string().email() }),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    }, { email: 'not-an-email' });

    expect(response.status).toBe(400);
    expect(response.headers.get(requestIdHeader)).toBe('req-test');
    await expect(response.json()).resolves.toEqual({
      error: {
        code: 'validation_failed',
        message: 'The request did not pass validation.',
        requestId: 'req-test',
        retryable: false,
      },
    });
  });

  it('returns a request id but no stack trace for an unhandled error', async () => {
    const response = await request({
      request: z.object({}),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => {
        throw new Error('stack-only-test-error');
      },
    }, {});

    expect(response.status).toBe(500);
    expect(response.headers.get(requestIdHeader)).toBe('req-test');
    const body = await response.text();
    expect(body).not.toContain('stack-only-test-error');
    expect(JSON.parse(body) as unknown).toEqual({
      error: {
        code: 'internal_error',
        message: 'An unexpected error occurred.',
        requestId: 'req-test',
        retryable: false,
      },
    });
  });

  it('adds a request id to successful responses', async () => {
    const response = await request({
      request: z.object({}),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    }, {});

    expect(response.status).toBe(200);
    expect(response.headers.get(requestIdHeader)).toBe('req-test');
  });
});

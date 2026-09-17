import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Timestamp, UserId } from '../src/shared/kernel/index.js';
import type { AuthorizationPort, CheckRequest, CheckResult, RelationshipUpdate, ZedToken } from '../src/modules/authz/index.js';
import { createHttpServer, defineRoute, requestIdHeader, type HttpServerOptions } from '../src/platform/http/index.js';

const servers: ReturnType<typeof createHttpServer>[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).filter((server) => server.listening).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => error === undefined ? resolve() : reject(error));
  })));
});

async function request(
  routes: readonly ReturnType<typeof defineRoute>[],
  path: string,
  method: string,
  body: unknown,
  options: Omit<HttpServerOptions, 'requestIdFactory'> = {},
): Promise<Response> {
  const server = createHttpServer(routes, { ...options, requestIdFactory: () => 'req-test' });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Test server did not bind to TCP.');

  return fetch(`http://127.0.0.1:${(address as AddressInfo).port}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
  });
}

class TestAuthorizationPort implements AuthorizationPort {
  constructor(private readonly allowedPermissions: ReadonlySet<string>) {}

  async check(request: CheckRequest): Promise<CheckResult> {
    return {
      allowed: this.allowedPermissions.has(request.permission),
      checkedAt: Timestamp(new Date('2026-01-01T00:00:00.000Z')),
      token: 'test-zed-token' as ZedToken,
      snapshotAgeMs: 0,
    };
  }

  async checkMany(requests: CheckRequest[]): Promise<CheckResult[]> {
    return Promise.all(requests.map(async (request) => this.check(request)));
  }

  async write(_updates: RelationshipUpdate[]): Promise<ZedToken> {
    return 'test-zed-token' as ZedToken;
  }

  async explain(request: CheckRequest): Promise<{ allowed: boolean; path: string[] }> {
    const result = await this.check(request);
    return { allowed: result.allowed, path: [] };
  }
}

describe('HTTP server boundaries', () => {
  it('returns the validation_failed envelope for an invalid request body', async () => {
    const response = await request([defineRoute({
      method: 'POST',
      path: '/api/v1/check',
      permission: 'public',
      params: z.object({}),
      request: z.object({ email: z.string().email() }),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    })], '/api/v1/check', 'POST', { email: 'not-an-email' });

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
    const response = await request([defineRoute({
      method: 'POST',
      path: '/api/v1/check',
      permission: 'public',
      params: z.object({}),
      request: z.object({}),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => {
        throw new Error('stack-only-test-error');
      },
    })], '/api/v1/check', 'POST', {});

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
    const response = await request([defineRoute({
      method: 'POST',
      path: '/api/v1/check',
      permission: 'public',
      params: z.object({}),
      request: z.object({}),
      response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    })], '/api/v1/check', 'POST', {});

    expect(response.status).toBe(200);
    expect(response.headers.get(requestIdHeader)).toBe('req-test');
  });

  it('maps three handlers, including a validated path parameter, on one server', async () => {
    const routes = [
      defineRoute({
        method: 'POST', path: '/api/v1/first', params: z.object({}), permission: 'public',
        request: z.object({}), response: z.object({ route: z.literal('first') }),
        handle: async () => ({ body: { route: 'first' } }),
      }),
      defineRoute({
        method: 'POST', path: '/api/v1/second/:id', params: z.object({ id: z.string().uuid() }), permission: 'public',
        request: z.object({}), response: z.object({ route: z.literal('second'), id: z.string().uuid() }),
        handle: async (httpRequest) => ({ body: { route: 'second', id: httpRequest.params.id } }),
      }),
      defineRoute({
        method: 'POST', path: '/api/v1/third', params: z.object({}), permission: 'public',
        request: z.object({}), response: z.object({ route: z.literal('third') }),
        handle: async () => ({ body: { route: 'third' } }),
      }),
    ];

    const first = await request(routes, '/api/v1/first', 'POST', {});
    const second = await request(routes, '/api/v1/second/018f8f9d-7f83-7abc-8def-0123456789ab', 'POST', {});
    const third = await request(routes, '/api/v1/third', 'POST', {});

    await expect(first.json()).resolves.toEqual({ route: 'first' });
    await expect(second.json()).resolves.toEqual({ route: 'second', id: '018f8f9d-7f83-7abc-8def-0123456789ab' });
    await expect(third.json()).resolves.toEqual({ route: 'third' });
  });

  it('returns validation_failed without calling a handler for an invalid path parameter', async () => {
    let calls = 0;
    const routes = [defineRoute({
      method: 'POST', path: '/api/v1/second/:id', params: z.object({ id: z.string().uuid() }), permission: 'public',
      request: z.object({}), response: z.object({ accepted: z.literal(true) }),
      handle: async () => {
        calls += 1;
        return { body: { accepted: true } };
      },
    })];

    const response = await request(routes, '/api/v1/second/not-a-uuid', 'POST', {});

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: 'validation_failed', requestId: 'req-test' },
    });
    expect(calls).toBe(0);
  });

  it('returns the error envelope for an unknown path and a known path with the wrong method', async () => {
    const routes = [defineRoute({
      method: 'POST', path: '/api/v1/check', params: z.object({}), permission: 'public',
      request: z.object({}), response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    })];

    const unknown = await request(routes, '/api/v1/missing', 'POST', {});
    const wrongMethod = await request(routes, '/api/v1/check', 'GET', {});

    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({ error: { code: 'not_found', requestId: 'req-test' } });
    expect(wrongMethod.status).toBe(405);
    expect(await wrongMethod.json()).toMatchObject({ error: { code: 'method_not_allowed', requestId: 'req-test' } });
  });

  it('fails startup with the method and path when a route has no permission declaration', () => {
    expect(() => createHttpServer([defineRoute({
      method: 'POST', path: '/api/v1/undeclared', params: z.object({}),
      request: z.object({}), response: z.object({ accepted: z.literal(true) }),
      handle: async () => ({ body: { accepted: true } }),
    })])).toThrow('Route POST /api/v1/undeclared is missing a permission declaration.');
  });

  it('returns 403 when a visible resource lacks the declared permission', async () => {
    let calls = 0;
    const routes = [defineRoute({
      method: 'POST', path: '/api/v1/projects/:id/entitlements', params: z.object({ id: z.string().uuid() }),
      permission: { resource: 'project', id: (httpRequest) => httpRequest.params.id, permission: 'set_entitlement' },
      request: z.object({}), response: z.object({ accepted: z.literal(true) }),
      handle: async () => {
        calls += 1;
        return { body: { accepted: true } };
      },
    })];

    const response = await request(
      routes,
      '/api/v1/projects/018f8f9d-7f83-7abc-8def-0123456789ab/entitlements',
      'POST',
      {},
      { authorization: { currentUser: async () => UserId('018f8f9d-7f83-7abc-8def-0123456789ac'), port: new TestAuthorizationPort(new Set(['view'])) } },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'forbidden', requestId: 'req-test' } });
    expect(calls).toBe(0);
  });

  it('returns 404 instead of 403 when the user cannot view the resource', async () => {
    let calls = 0;
    const routes = [defineRoute({
      method: 'POST', path: '/api/v1/projects/:id/entitlements', params: z.object({ id: z.string().uuid() }),
      permission: { resource: 'project', id: (httpRequest) => httpRequest.params.id, permission: 'set_entitlement' },
      request: z.object({}), response: z.object({ accepted: z.literal(true) }),
      handle: async () => {
        calls += 1;
        return { body: { accepted: true } };
      },
    })];

    const response = await request(
      routes,
      '/api/v1/projects/018f8f9d-7f83-7abc-8def-0123456789ab/entitlements',
      'POST',
      {},
      { authorization: { currentUser: async () => UserId('018f8f9d-7f83-7abc-8def-0123456789ac'), port: new TestAuthorizationPort(new Set()) } },
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'not_found', requestId: 'req-test' } });
    expect(calls).toBe(0);
  });
});

import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DomainError, type JsonObject } from '../../shared/kernel/index.js';
import type { CurrentUser } from '../../modules/identity/application/current-user.js';
import type { AuthorizationPort, CheckRequest } from '../../modules/authz/index.js';
import { z } from 'zod';

export const requestIdHeader = 'x-request-id';

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    requestId: z.string(),
    retryable: z.boolean(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

export interface HttpRequest<TBody, TQuery = Record<string, never>> {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: TBody;
  readonly params: Readonly<Record<string, string>>;
  readonly query: TQuery;
  readonly requestId: string;
}

export interface HttpResponse<TBody> {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: TBody;
}

export interface HttpEndpoint<TRequest, TResponse, TQuery = Record<string, never>> {
  readonly request: z.ZodType<TRequest>;
  readonly response: z.ZodType<TResponse>;
  handle(request: HttpRequest<TRequest, TQuery>): Promise<HttpResponse<TResponse>> | HttpResponse<TResponse>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type RoutePermission<TBody, TParams extends Record<string, string>, TQuery> =
  | 'public'
  | 'authenticated'
  | {
    readonly resource: CheckRequest['resource']['type'];
    readonly id: (request: HttpRequest<TBody, TQuery> & { readonly params: TParams }) => string;
    readonly permission: string;
  };

export interface HttpRoute<TRequest, TResponse, TParams extends Record<string, string>, TQuery = Record<string, never>> extends HttpEndpoint<TRequest, TResponse, TQuery> {
  readonly method: HttpMethod;
  readonly path: string;
  readonly params: z.ZodType<TParams>;
  readonly query?: z.ZodType<TQuery>;
  readonly permission?: RoutePermission<TRequest, TParams, TQuery>;
  handle(request: HttpRequest<TRequest, TQuery> & { readonly params: TParams }): Promise<HttpResponse<TResponse>> | HttpResponse<TResponse>;
}

type RegisteredRoute = HttpRoute<unknown, unknown, Record<string, string>, unknown>;

export function defineRoute<TRequest, TResponse, TParams extends Record<string, string>, TQuery = Record<string, never>>(
  route: HttpRoute<TRequest, TResponse, TParams, TQuery>,
): RegisteredRoute {
  return route as unknown as RegisteredRoute;
}

export interface HttpLogger {
  error(error: unknown, requestId: string): void;
}

export interface HttpServerOptions {
  readonly requestIdFactory?: () => string;
  readonly logger?: HttpLogger;
  readonly authorization?: {
    readonly currentUser: (headers: IncomingHttpHeaders) => Promise<CurrentUser | null>;
    readonly port?: AuthorizationPort;
  };
}

class InvalidJsonBody extends Error {
  constructor() {
    super('Request body is not valid JSON.');
  }
}

const defaultLogger: HttpLogger = {
  error(error: unknown, requestId: string): void {
    const stack = error instanceof Error ? error.stack : undefined;
    console.error('Unhandled HTTP request error.', { requestId, stack });
  },
};

function errorEnvelope(
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  details?: JsonObject,
): ErrorEnvelope {
  return {
    error: {
      code,
      message,
      ...(details === undefined ? {} : { details }),
      requestId,
      retryable,
    },
  };
}

function writeJson(response: ServerResponse, status: number, requestId: string, body: unknown, headers?: Readonly<Record<string, string>>): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader(requestIdHeader, requestId);
  for (const [name, value] of Object.entries(headers ?? {})) response.setHeader(name, value);
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const body = Buffer.concat(chunks).toString('utf8');
  if (body.trim().length === 0) return undefined;

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new InvalidJsonBody();
  }
}

function validationFailure(requestId: string): ErrorEnvelope {
  return errorEnvelope('validation_failed', 'The request did not pass validation.', requestId, false);
}

function routeMatch(path: string, route: RegisteredRoute): Record<string, string> | null {
  const pathSegments = path.split('/').filter((segment) => segment.length > 0);
  const routeSegments = route.path.split('/').filter((segment) => segment.length > 0);
  if (pathSegments.length !== routeSegments.length) return null;

  const params: Record<string, string> = {};
  for (let index = 0; index < routeSegments.length; index += 1) {
    const routeSegment = routeSegments[index];
    const pathSegment = pathSegments[index];
    if (routeSegment === undefined || pathSegment === undefined) return null;
    if (routeSegment.startsWith(':')) {
      const name = routeSegment.slice(1);
      if (name.length === 0) return null;
      try {
        params[name] = decodeURIComponent(pathSegment);
      } catch {
        return null;
      }
      continue;
    }
    if (routeSegment !== pathSegment) return null;
  }
  return params;
}

function queryParameters(search: URLSearchParams): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of search) {
    const current = query[key];
    if (current === undefined) query[key] = value;
    else query[key] = Array.isArray(current) ? [...current, value] : [current, value];
  }
  return query;
}

function notFound(requestId: string): ErrorEnvelope {
  return errorEnvelope('not_found', 'The requested resource was not found.', requestId, false);
}

function methodNotAllowed(requestId: string): ErrorEnvelope {
  return errorEnvelope('method_not_allowed', 'The request method is not allowed for this resource.', requestId, false);
}

function unauthorized(requestId: string): ErrorEnvelope {
  return errorEnvelope('unauthenticated', 'Sign in is required.', requestId, false);
}

function forbidden(requestId: string): ErrorEnvelope {
  return errorEnvelope('forbidden', 'You do not have permission to perform this action.', requestId, false);
}

function assertRoutePermissions(routes: readonly RegisteredRoute[], authorization: HttpServerOptions['authorization']): void {
  for (const route of routes) {
    if (route.permission === undefined) {
      throw new Error(`Route ${route.method} ${route.path} is missing a permission declaration.`);
    }
    if (typeof route.permission === 'object' && authorization?.port === undefined) {
      throw new Error(`Route ${route.method} ${route.path} requires an AuthorizationPort.`);
    }
  }
}

export function createHttpServer(
  routes: readonly RegisteredRoute[],
  options: HttpServerOptions = {},
): Server {
  const requestIdFactory = options.requestIdFactory ?? randomUUID;
  const logger = options.logger ?? defaultLogger;
  assertRoutePermissions(routes, options.authorization);

  return createServer(async (request, response) => {
    const requestId = requestIdFactory();
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const path = url.pathname;
      const matchingPaths = routes.flatMap((route) => {
        const params = routeMatch(path, route);
        return params === null ? [] : [{ route, params }];
      });
      if (matchingPaths.length === 0) {
        writeJson(response, 404, requestId, notFound(requestId));
        return;
      }
      const matched = matchingPaths.find(({ route }) => route.method === request.method);
      if (matched === undefined) {
        writeJson(response, 405, requestId, methodNotAllowed(requestId));
        return;
      }

      const body = await readJsonBody(request);
      const parsedRequest = matched.route.request.safeParse(body);
      const parsedParams = matched.route.params.safeParse(matched.params);
      const parsedQuery = (matched.route.query ?? z.object({})).safeParse(queryParameters(url.searchParams));
      if (!parsedRequest.success || !parsedParams.success || !parsedQuery.success) {
        writeJson(response, 400, requestId, validationFailure(requestId));
        return;
      }

      if (matched.route.permission !== 'public') {
        const authorization = options.authorization;
        const user = authorization === undefined ? null : await authorization.currentUser(request.headers);
        if (user === null) {
          writeJson(response, 401, requestId, unauthorized(requestId));
          return;
        }
        if (typeof matched.route.permission === 'object') {
          const resource = {
            type: matched.route.permission.resource,
            id: matched.route.permission.id({
              method: request.method ?? 'GET',
              path,
              headers: request.headers,
              body: parsedRequest.data,
              params: parsedParams.data,
              query: parsedQuery.data,
              requestId,
            }),
          };
          const authorizationPort = authorization?.port;
          if (authorizationPort === undefined) throw new Error('AuthorizationPort was not configured.');
          const view = await authorizationPort.check({ resource, permission: 'view', subject: { type: 'user', id: user.id } });
          if (!view.allowed) {
            writeJson(response, 404, requestId, notFound(requestId));
            return;
          }
          if (matched.route.permission.permission !== 'view') {
            const permission = await authorizationPort.check({
              resource,
              permission: matched.route.permission.permission,
              subject: { type: 'user', id: user.id },
            });
            if (!permission.allowed) {
              writeJson(response, 403, requestId, forbidden(requestId));
              return;
            }
          }
        }
      }

      const result = await matched.route.handle({
        method: request.method ?? 'GET',
        path,
        headers: request.headers,
        body: parsedRequest.data,
        params: parsedParams.data,
        query: parsedQuery.data,
        requestId,
      });
      const parsedResponse = matched.route.response.safeParse(result.body);
      if (!parsedResponse.success) throw new Error('HTTP response did not pass its boundary schema.');

      writeJson(response, result.status ?? 200, requestId, parsedResponse.data, result.headers);
    } catch (error: unknown) {
      if (error instanceof InvalidJsonBody) {
        writeJson(response, 400, requestId, validationFailure(requestId));
        return;
      }
      if (error instanceof DomainError) {
        writeJson(
          response,
          error.code === 'validation_failed' ? 400 : 500,
          requestId,
          errorEnvelope(error.code, error.message, requestId, error.retryable, error.details),
        );
        return;
      }

      logger.error(error, requestId);
      writeJson(
        response,
        500,
        requestId,
        errorEnvelope('internal_error', 'An unexpected error occurred.', requestId, false),
      );
    }
  });
}

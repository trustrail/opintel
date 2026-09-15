import { randomUUID } from 'node:crypto';
import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { DomainError, type JsonObject } from '../../shared/kernel/index.js';
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

export interface HttpRequest<TBody> {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: TBody;
  readonly requestId: string;
}

export interface HttpResponse<TBody> {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body: TBody;
}

export interface HttpEndpoint<TRequest, TResponse> {
  readonly request: z.ZodType<TRequest>;
  readonly response: z.ZodType<TResponse>;
  handle(request: HttpRequest<TRequest>): Promise<HttpResponse<TResponse>> | HttpResponse<TResponse>;
}

export interface HttpLogger {
  error(error: unknown, requestId: string): void;
}

export interface HttpServerOptions {
  readonly requestIdFactory?: () => string;
  readonly logger?: HttpLogger;
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

export function createHttpServer<TRequest, TResponse>(
  endpoint: HttpEndpoint<TRequest, TResponse>,
  options: HttpServerOptions = {},
): Server {
  const requestIdFactory = options.requestIdFactory ?? randomUUID;
  const logger = options.logger ?? defaultLogger;

  return createServer(async (request, response) => {
    const requestId = requestIdFactory();
    try {
      const body = await readJsonBody(request);
      const parsedRequest = endpoint.request.safeParse(body);
      if (!parsedRequest.success) {
        writeJson(response, 400, requestId, validationFailure(requestId));
        return;
      }

      const result = await endpoint.handle({
        method: request.method ?? 'GET',
        path: new URL(request.url ?? '/', 'http://localhost').pathname,
        headers: request.headers,
        body: parsedRequest.data,
        requestId,
      });
      const parsedResponse = endpoint.response.safeParse(result.body);
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

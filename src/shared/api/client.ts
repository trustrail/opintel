import { z } from 'zod';
import type { ErrorCode, JsonObject, JsonValue } from '../kernel/index.js';

export type AppError = {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: JsonObject;
  readonly requestId: string | null;
  readonly retryable: boolean;
};

export type ApiResult<T> =
  | { readonly ok: true; readonly value: T; readonly requestId: string | null }
  | { readonly ok: false; readonly error: AppError };

export type ApiRequest<T> = {
  readonly path: string;
  readonly response: z.ZodType<T>;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ApiResponse = {
  readonly ok: boolean;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type ApiFetchInit = {
  readonly method: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly body?: string;
};

export type ApiFetcher = (input: string, init: ApiFetchInit) => Promise<ApiResponse>;

const requestIdHeader = 'x-request-id';

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() => z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(jsonValueSchema),
  z.record(z.string(), jsonValueSchema),
]));

const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), jsonValueSchema).optional(),
    requestId: z.string(),
    retryable: z.boolean(),
  }),
});

function transportError(requestId: string | null): AppError {
  return {
    code: 'dependency_unavailable',
    message: 'The service could not be reached. Try again.',
    requestId,
    retryable: true,
  };
}

function appError(error: z.infer<typeof errorEnvelopeSchema>['error']): AppError {
  return {
    code: error.code as ErrorCode,
    message: error.message,
    ...(error.details === undefined ? {} : { details: error.details }),
    requestId: error.requestId,
    retryable: error.retryable,
  };
}

async function parseBody(response: ApiResponse): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  return JSON.parse(text) as unknown;
}

const defaultFetcher: ApiFetcher = (input, init) => globalThis.fetch(input, init);

export function createApiClient(fetcher: ApiFetcher = defaultFetcher): { request<T>(request: ApiRequest<T>): Promise<ApiResult<T>> } {
  return {
    async request<T>(request: ApiRequest<T>): Promise<ApiResult<T>> {
      const headers = { ...request.headers };
      if (request.body !== undefined && headers['content-type'] === undefined) headers['content-type'] = 'application/json';

      let response: ApiResponse;
      try {
        response = await fetcher(request.path, {
          method: request.method ?? 'GET',
          headers,
          ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        });
      } catch {
        return { ok: false, error: transportError(null) };
      }

      const requestId = response.headers.get(requestIdHeader);
      let body: unknown;
      try {
        body = await parseBody(response);
      } catch {
        return { ok: false, error: transportError(requestId) };
      }

      if (!response.ok) {
        const parsed = errorEnvelopeSchema.safeParse(body);
        if (!parsed.success) return { ok: false, error: transportError(requestId) };
        return { ok: false, error: appError(parsed.data.error) };
      }

      const parsed = request.response.safeParse(body);
      if (!parsed.success) return { ok: false, error: transportError(requestId) };
      return { ok: true, value: parsed.data, requestId };
    },
  };
}

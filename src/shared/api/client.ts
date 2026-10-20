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
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly response: z.ZodType<T>;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly body?: JsonValue;
  readonly headers?: Readonly<Record<string, string>>;
};

export type ApiResponse = {
  readonly ok: boolean;
  readonly status?: number;
  readonly headers: { get(name: string): string | null };
  text(): Promise<string>;
};

export type ApiFetchInit = {
  readonly signal?: AbortSignal;
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

export const apiTimeoutMs = 30_000;
type ClientFailure='network'|'invalid_json'|'unexpected_error'|'schema_mismatch'|'timeout'|'cancelled';
function clientError(failure:ClientFailure,requestId:string|null,status:number|null,timeoutMs:number,writing:boolean):AppError {
 const messages:Record<ClientFailure,string>={
  network:'The console could not connect to the service. Check your network or VPN, then retry.',
  invalid_json:'The service returned unreadable data (invalid JSON). Retry; if it continues, ask your operator to check the API or proxy.',
  unexpected_error:`The service returned an unexpected error response${status===null?'':` (HTTP ${status})`}. Ask your operator to check the API or proxy.`,
  schema_mismatch:'The service responded, but its data does not match this console version. Reload the console; if it continues, check that the console and API versions match.',
  timeout:`The request did not finish within ${timeoutMs/1000} seconds. Refresh to check its status before trying again.`,
  cancelled:'The request was cancelled. Refresh when you are ready to check its status.',
 };
 return {code:'dependency_unavailable',message:messages[failure]+(writing?' The change may still have completed. Check before submitting it again.':'')+(requestId===null?'':` Request ID: ${requestId}.`),requestId,retryable:failure!=='cancelled',details:{failure,...status===null?{}:{status}}};
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

function logFailure(failure:ClientFailure,status:number|null,requestId:string|null):void {
 if(typeof window!=='undefined'&&failure!=='cancelled')console.error({timestamp:new Date().toISOString(),failure,status,requestId});
}

const defaultFetcher: ApiFetcher = (input, init) => globalThis.fetch(input, init);

export function createApiClient(fetcher: ApiFetcher = defaultFetcher,defaults:{signal?:AbortSignal}={}): { request<T>(request: ApiRequest<T>): Promise<ApiResult<T>> } {
 return {
  async request<T>(request:ApiRequest<T>):Promise<ApiResult<T>> {
   const timeoutMs=request.timeoutMs??apiTimeoutMs;
   if(!Number.isFinite(timeoutMs)||timeoutMs<=0)return {ok:false,error:{code:'validation_failed',message:'The request timeout must be a positive number of milliseconds.',requestId:null,retryable:false}};
   const callerSignal=request.signal??defaults.signal;
   const controller=new AbortController();let failure:'timeout'|'cancelled'|undefined,requestId:string|null=null,status:number|null=null;
   const cancel=()=>{failure??='cancelled';controller.abort();};
   callerSignal?.addEventListener('abort',cancel,{once:true});
   const timer=setTimeout(()=>{failure??='timeout';controller.abort();},timeoutMs);
   let onAbort:()=>void=()=>{};
   const aborted=new Promise<never>((_resolve,reject)=>{onAbort=()=>reject(new Error('Request aborted'));controller.signal.addEventListener('abort',onAbort,{once:true});});
   const fail=(kind:ClientFailure):ApiResult<T>=>{logFailure(kind,status,requestId);return {ok:false,error:clientError(kind,requestId,status,timeoutMs,(request.method??'GET')!=='GET')};};
   try {
    if(callerSignal?.aborted){failure='cancelled';controller.abort();return await Promise.race([Promise.resolve(fail('cancelled')),aborted]);}
    const perform=async():Promise<ApiResult<T>>=>{
     const headers={...request.headers};if(request.body!==undefined&&headers['content-type']===undefined)headers['content-type']='application/json';
     const response=await fetcher(request.path,{method:request.method??'GET',headers,signal:controller.signal,...request.body===undefined?{}:{body:JSON.stringify(request.body)}});
     requestId=response.headers.get(requestIdHeader);status=response.status??null;
     const text=await response.text();if(controller.signal.aborted)throw new Error('Request aborted');
     let body:unknown;try{body=text.length===0?undefined:JSON.parse(text) as unknown;}catch{return fail('invalid_json');}
     if(!response.ok){const parsed=errorEnvelopeSchema.safeParse(body);return parsed.success?{ok:false,error:appError(parsed.data.error)}:fail('unexpected_error');}
     const parsed=request.response.safeParse(body);return parsed.success?{ok:true,value:parsed.data,requestId}:fail('schema_mismatch');
    };
    return await Promise.race([perform(),aborted]);
   }catch{return fail(failure??'network');}
   finally{clearTimeout(timer);callerSignal?.removeEventListener('abort',cancel);controller.signal.removeEventListener('abort',onAbort);}
  },
 };
}

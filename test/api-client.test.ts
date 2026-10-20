import { afterEach,describe, expect, it,vi } from 'vitest';
import { z } from 'zod';
import { createApiClient,apiTimeoutMs, type ApiFetcher } from '../src/shared/api/index.js';

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
        message: 'The console could not connect to the service. Check your network or VPN, then retry.',
        details:{failure:'network'},
        requestId: null,
        retryable: true,
      },
    });
  });
});

afterEach(()=>vi.useRealTimers());
it.each([
 ['<html>proxy</html>',200,'invalid_json','invalid JSON'],
 ['{"unexpected":"secret-value"}',502,'unexpected_error','HTTP 502'],
 ['{"accepted":"secret-value"}',200,'schema_mismatch','console and API versions'],
] as const)('X-05: distinguishes %s without exposing response values',async(body,status,failure,message)=>{
 const result=await createApiClient(async()=>response(body,status,'req-bad')).request({path:'/api',response:z.object({accepted:z.boolean()})});
 expect(result).toMatchObject({ok:false,error:{requestId:'req-bad',details:{failure,status},message:expect.stringContaining(message)}});
 expect(JSON.stringify(result)).not.toContain('secret-value');
 expect(result.ok?null:result.error.message).toContain('Request ID: req-bad.');
});
it('X-05: application timeout aborts a hung body read and keeps the known request id',async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;
 const client=createApiClient(async(_path,init)=>{signal=init.signal;return {ok:true,status:200,headers:{get:()=> 'req-body'},text:()=>new Promise<string>(()=>{})};});
 const pending=client.request({path:'/api',response:z.object({ok:z.boolean()})});
 await vi.advanceTimersByTimeAsync(apiTimeoutMs);
 expect(await pending).toMatchObject({ok:false,error:{requestId:'req-body',details:{failure:'timeout'},message:expect.stringContaining('30 seconds')}});
 expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('X-05: caller cancellation aborts in-flight fetch without waiting for timeout',async()=>{
 vi.useFakeTimers();let signal:AbortSignal|undefined;const controller=new AbortController();
 const client=createApiClient(async(_path,init)=>{signal=init.signal;return new Promise<Response>(()=>{});});
 const pending=client.request({path:'/api',method:'POST',body:{ok:true},signal:controller.signal,response:z.undefined()});controller.abort();
 expect(await pending).toMatchObject({ok:false,error:{retryable:false,details:{failure:'cancelled'},message:expect.stringContaining('change may still have completed')}});
 expect(signal?.aborted).toBe(true);expect(vi.getTimerCount()).toBe(0);
});
it('X-05: an already-cancelled request does not call fetch',async()=>{
 const fetcher=vi.fn(async()=>response('{}',200,null)),controller=new AbortController();controller.abort();
 expect(await createApiClient(fetcher).request({path:'/api',signal:controller.signal,response:z.object({})})).toMatchObject({ok:false,error:{details:{failure:'cancelled'}}});expect(fetcher).not.toHaveBeenCalled();
});
it('X-05: response completion removes timeout/listener; late cancellation cannot change success',async()=>{
 vi.useFakeTimers();const controller=new AbortController(),remove=vi.spyOn(controller.signal,'removeEventListener');
 const result=await createApiClient(async()=>response('{"accepted":true}',200,'req-ok')).request({path:'/api',signal:controller.signal,response:z.object({accepted:z.boolean()})});
 controller.abort();await vi.advanceTimersByTimeAsync(apiTimeoutMs+1);expect(result.ok).toBe(true);expect(remove).toHaveBeenCalled();expect(vi.getTimerCount()).toBe(0);
});
it('X-05: body transport failure is network, preserving HTTP status and request id',async()=>{
 const result=await createApiClient(async()=>({ok:true,status:200,headers:{get:()=> 'req-read'},text:async()=>{throw new TypeError('body sentinel');}})).request({path:'/api',response:z.undefined()});
 expect(result).toMatchObject({ok:false,error:{requestId:'req-read',details:{failure:'network',status:200}}});expect(JSON.stringify(result)).not.toContain('sentinel');
});

it('X-05: a client-bound cancellation signal reaches requests without an explicit signal',async()=>{
 const controller=new AbortController(),fetcher=vi.fn(async()=>response('{}',200,null));controller.abort();
 const result=await createApiClient(fetcher,{signal:controller.signal}).request({path:'/api',response:z.object({})});
 expect(result).toMatchObject({ok:false,error:{details:{failure:'cancelled'}}});expect(fetcher).not.toHaveBeenCalled();
});

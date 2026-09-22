import { canonicalisers, type CanonicaliserRegistry } from '../tokenize/canonicalisers/index.js';
import { custodyOperations,custodyEnvelope,safeCustodyMessage,type CustodyOperation } from '../../src/shared/custody-contract.js';
import { safeSourceMessage } from '../../src/shared/source-errors.js';
import { provisionDemoResponse } from '../../src/shared/demo-contract.js';
import { randomUUID, X509Certificate } from 'node:crypto';
import { createServer } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import type { TLSSocket } from 'node:tls';
import { z } from 'zod';
import { DomainError, type Result } from '../../src/shared/kernel/index.js';
import * as wire from '../../src/shared/sidecar-contract.js';
import type { SidecarConnector } from '../application/source-connector.js';
import type { SidecarConfig, SidecarTls } from '../config.js';

export const sidecarBuild = { version: '0.1.0', contract: 1, duckdb: 'not-loaded', canonicalisers: canonicalisers.ids } as const;
type Route = { permission: 'pinned_application_certificate'; invoke: (body: unknown, signal: AbortSignal) => Promise<Result<unknown>>; response: z.ZodType };
const statusFor = (code: string) => code === 'forbidden' ? 403 : code === 'validation_failed' ? 400 : code === 'conflict' ? 409 : code === 'object_unavailable' ? 404 : code === 'budget_exceeded' ? 429 : 503;
const errorMessages: Readonly<Record<string,string>> = {
  forbidden: 'Sampling requires source consent.', validation_failed: 'The request did not pass validation.',
  object_unavailable: 'The source object is unavailable.', budget_exceeded: 'Source connection limit reached.',
  source_unavailable: 'The source is unavailable.', dependency_unavailable: 'A sidecar dependency is unavailable.',
  conflict: 'The demo template or delivery path conflicts with an existing delivery.',
};

export function createSidecarServer(options: {
  config: SidecarConfig; tls: SidecarTls; connector: SidecarConnector;
  demo?: { provision(body: unknown, signal?: AbortSignal): Promise<Result<unknown>> };
  custody?: {invoke(operation:CustodyOperation,projectId:string,payload:unknown):Promise<Result<unknown>>};
  canonicalisers?: CanonicaliserRegistry;
  build?: typeof sidecarBuild | { version: string; contract: number; duckdb: string };
}) {
  const build = wire.healthResponse.parse({ ...(options.build ?? sidecarBuild), canonicalisers: (options.canonicalisers ?? canonicalisers).ids });
  const pin = new X509Certificate(options.tls.clientPin).fingerprint256;
  const routes: Record<string, Route> = {
    ...(options.demo ? { '/provision-demo': { permission: 'pinned_application_certificate' as const, response: provisionDemoResponse, invoke: (body: unknown, signal: AbortSignal) => options.demo!.provision(body,signal) } } : {}),
    '/health': { permission:'pinned_application_certificate', response:wire.healthResponse, invoke:async()=>({ok:true,value:build}) },
    '/test-connection': { permission:'pinned_application_certificate', response:wire.connectionResponse, invoke:(body,signal)=>options.connector.testConnection(body,signal) },
    '/introspect': { permission:'pinned_application_certificate', response:wire.snapshotResponse, invoke:(body,signal)=>options.connector.introspect(body,signal) },
    '/sample': { permission:'pinned_application_certificate', response:wire.sampleResponse, invoke:(body,signal)=>options.connector.sampleTopValues(body,signal) },
    '/estimate': { permission:'pinned_application_certificate', response:wire.estimateResponse, invoke:(body,signal)=>options.connector.estimateRowCount(body,signal) },
  };
  for(const operation of Object.keys(custodyOperations) as CustodyOperation[]) routes['/custody/'+operation]={permission:'pinned_application_certificate',response:custodyOperations[operation].response,invoke:async body=>{const request=custodyEnvelope.parse(body);return options.custody?options.custody.invoke(operation,request.projectId,request.payload):{ok:false,error:new DomainError('dependency_unavailable','Token key custody metadata could not be saved or read. Check the sidecar custody directory.')};}};
  for (const route of Object.values(routes)) if (route.permission !== 'pinned_application_certificate') throw new Error('Sidecar route lacks a declared permission.');
  const sockets = new Set<Socket>();
  const active = new Map<AbortController, Promise<void>>();
  let shuttingDown = false;
  function send(res: ServerResponse, status: number, body: unknown): void {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'content-type':'application/json', 'cache-control':'no-store' });
    res.end(JSON.stringify(body));
  }
  function fail(res: ServerResponse, status: number, code: string, message: string, requestId: string, retryable=false) {
    if(status<500)console.info({event:'sidecar.refused',reason:code,requestId});
    send(res,status,{error:{code,message,requestId,retryable}});
  }
  async function handle(req: IncomingMessage,res: ServerResponse,controller: AbortController): Promise<void> {
    let requestId: string = randomUUID();
    const socket = req.socket as TLSSocket;
    if (!socket.authorized || socket.getPeerCertificate()?.fingerprint256 !== pin) { socket.destroy(); return; }
    if (shuttingDown) { fail(res,503,'dependency_unavailable','Sidecar is shutting down.',requestId,true); return; }
    const path = req.url ?? '';
    const route = Object.hasOwn(routes,path) ? routes[path] : undefined;
    if (route === undefined) { fail(res,404,'not_found','The endpoint does not exist.',requestId); req.resume(); return; }
    if (req.method !== 'POST') { fail(res,405,'method_not_allowed','This endpoint requires POST.',requestId); req.resume(); return; }
    try {
      const bytes = await readBody(req,options.config.maxRequestBytes);
      const size = bytes.length;
      if (controller.signal.aborted) return;
      let body: unknown;
      if (path === '/health') {
        if (size !== 0) { fail(res,400,'validation_failed','Health requests must have no body.',requestId); return; }
      } else {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) { fail(res,415,'validation_failed','A JSON request body is required.',requestId); return; }
        try { body = JSON.parse(bytes.toString('utf8')) as unknown; }
        catch { fail(res,400,'validation_failed','The request body is not valid JSON.',requestId); return; }
        const parsed = (path.startsWith('/custody/')?custodyEnvelope:wire.envelope).safeParse(body);
        if (!parsed.success) { fail(res,400,'validation_failed','The request did not pass validation.',requestId); return; }
        requestId = parsed.data.requestId;
      }
      const result = await route.invoke(body,controller.signal);
      if (controller.signal.aborted) return;
      if (!result.ok) {
        const code = result.error.code;
        fail(res,statusFor(code),code,path.startsWith('/custody/') ? safeCustodyMessage(result.error.message) : req.url === '/provision-demo' ? safeSourceMessage(code,result.error.message) : errorMessages[code] ?? 'The sidecar operation failed.',requestId,result.error.retryable);
        return;
      }
      const response = route.response.safeParse(result.value);
      if (!response.success) throw new DomainError('dependency_unavailable','Invalid connector response.');
      send(res,200,response.data);
    } catch (error: unknown) {
      if (error instanceof RequestTooLarge) {
        res.setHeader('connection','close');
        res.once('finish',()=>req.destroy());
        fail(res,413,'validation_failed','The request is too large.',requestId);
        return;
      }
      if (!controller.signal.aborted) fail(res,503,'dependency_unavailable','The sidecar operation failed.',requestId,true);
    }
  }
  const server = createServer({ ...options.tls, minVersion:'TLSv1.3', requestCert:true, rejectUnauthorized:true },(req,res)=>{
    const controller = new AbortController();
    const abort = () => controller.abort();
    const closed = () => { if (!res.writableFinished) abort(); };
    req.once('aborted',abort);
    req.on('error',abort);
    res.once('close',closed);
    const work = handle(req,res,controller).catch(()=>{
      if(!controller.signal.aborted)fail(res,503,'dependency_unavailable','The sidecar operation failed.',randomUUID(),true);
    }).finally(()=>{
      req.removeListener('aborted',abort); res.removeListener('close',closed); active.delete(controller);
    });
    active.set(controller,work);
  });
  server.on('connection',(socket)=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
  server.on('secureConnection',(socket)=>{
    if (!socket.authorized || socket.getPeerCertificate()?.fingerprint256 !== pin) {
      console.info({event:'sidecar.refused',reason:'client_certificate_pin'});
      socket.destroy();
    }
  });
  server.on('tlsClientError',()=>console.info({event:'sidecar.refused',reason:'mutual_tls'}));
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  server.keepAliveTimeout = 1000;
  server.setTimeout(options.config.limits.operationTimeoutMs + 10000,(socket)=>socket.destroy());
  return {
    server,
    async listen(): Promise<number> {
      await new Promise<void>((resolve,reject)=>{
        server.once('error',reject);
        server.listen(options.config.port,options.config.host,()=>{server.removeListener('error',reject);resolve();});
      });
      const address = server.address();
      if (address === null || typeof address === 'string') throw new Error('Sidecar failed to listen.');
      return address.port;
    },
    async close(): Promise<void> {
      shuttingDown = true;
      const closed = new Promise<void>((resolve)=>server.close(()=>resolve()));
      for (const controller of active.keys()) controller.abort();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<void>((resolve)=>{timer=setTimeout(resolve,options.config.shutdownTimeoutMs);});
      try {
        await Promise.race([Promise.allSettled([...active.values()]),deadline]);
        for(const socket of sockets)socket.destroy();
        await closed;
      } finally { if(timer!==undefined)clearTimeout(timer); }
    },
  };
}

class RequestTooLarge extends Error {}
function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve,reject)=>{
    const chunks: Buffer[]=[];
    let size=0;
    const cleanup=()=>{req.removeListener('data',data);req.removeListener('end',end);req.removeListener('aborted',aborted);req.removeListener('error',failed);};
    const data=(chunk:Buffer)=>{
      size+=chunk.length;
      if(size>limit){req.pause();cleanup();reject(new RequestTooLarge());return;}
      chunks.push(chunk);
    };
    const end=()=>{cleanup();resolve(Buffer.concat(chunks));};
    const aborted=()=>{cleanup();reject(new Error('Request aborted.'));};
    const failed=()=>{cleanup();reject(new Error('Request failed.'));};
    req.on('data',data);req.once('end',end);req.once('aborted',aborted);req.once('error',failed);
  });
}

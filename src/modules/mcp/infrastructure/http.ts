import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, ToolSchema, JSONRPCMessageSchema, McpError, ErrorCode, isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ProjectId } from '../../../shared/kernel/index.js';
import { listedTools, toolDescriptor } from '../../../shared/api/mcp.js';
import { errorEnvelopeSchema, type PoolKeyHttpEndpoint } from '../../../platform/http/index.js';
import { McpAccess, type McpConfiguration, type McpPrincipal } from '../application/access.js';
import type { DescribeTool } from '../application/describe.js';

type Session = { server: Server; transport: StreamableHTTPServerTransport; principal: McpPrincipal; fingerprint: string; heartbeatAt: number; pinging: boolean };
const fingerprint = (principal: McpPrincipal) => JSON.stringify(principal.pool.modes);
/** Stateful Streamable HTTP. Sessions never substitute for key authentication.
 * No credential, source value or query text is retained in session state. */
export class McpHttpServer implements PoolKeyHttpEndpoint {
 readonly permission = 'pool-key' as const;
 private readonly sessions = new Map<string, Session>();
 private readonly context = new AsyncLocalStorage<McpPrincipal>();
 private timer: ReturnType<typeof setInterval> | undefined;
 private refreshing = false;
 constructor(private readonly access: McpAccess, private readonly configuration: McpConfiguration, private readonly describeTool?: DescribeTool) {}
 start() {
  this.timer ??= setInterval(() => { void this.refresh().catch(() => { console.warn({event:'mcp.refresh_failed',category:'dependency_unavailable'}); }); }, 1000);
  this.timer.unref();
 }
 async close() {
  clearInterval(this.timer); this.timer = undefined;
  await Promise.all([...this.sessions.values()].map(session => session.server.close()));
  this.sessions.clear();
 }
 /** Poll committed pool configuration, including changes made by another host.
  * Request authorization always reads current state independently of this poll. */
 async refresh() {
  if (this.refreshing) return;
  this.refreshing = true;
  try { await Promise.all([...this.sessions.values()].map(async session => {
   try {
    const result = await this.configuration.read(session.principal);
    if (!result.ok) { await session.server.close(); return; }
    const current = result.value;
    const updated = {...session.principal,pool:{...session.principal.pool,modes:current.modes}};
    if (fingerprint(updated) !== session.fingerprint) {
     session.principal = updated;
     await session.server.sendToolListChanged();
     session.fingerprint = fingerprint(updated);
    }
    if (!session.pinging && Date.now() >= session.heartbeatAt + current.heartbeatSeconds * 1000) {
     session.pinging = true; session.heartbeatAt = Date.now();
     // A ping being sent is not presence. Only an authenticated response is.
     void session.server.ping().catch(() => session.server.close()).finally(() => { session.pinging = false; });
    }
   } catch { await session.server.close(); }
  })); } finally { this.refreshing = false; }
 }
 private failure(response: ServerResponse, requestId: string, status: number, code: string, message: string) {
  console.info({event:'mcp.transport_refused',reason:code,requestId});
  response.writeHead(status, {'content-type':'application/json','cache-control':'no-store','x-request-id':requestId});
  response.end(JSON.stringify(errorEnvelopeSchema.parse({error:{code,message,requestId,retryable:false}})));
 }
 private async create(principal: McpPrincipal): Promise<Session> {
  const server = new Server({name:'opintel',version:'0.1.0'}, {capabilities:{tools:{listChanged:true}}});
  const transport = new StreamableHTTPServerTransport({sessionIdGenerator:randomUUID,enableJsonResponse:true,
   onsessioninitialized:id=>{this.sessions.set(id,session);},
  });
  const session: Session = {server,transport,principal,fingerprint:fingerprint(principal),heartbeatAt:Date.now(),pinging:false};
  server.onclose = () => { if (transport.sessionId) this.sessions.delete(transport.sessionId); };
  server.setRequestHandler(ListToolsRequestSchema, async () => {
   const caller = this.context.getStore();
   if (!caller) throw new Error('Missing authenticated MCP request context.');
   return {tools:listedTools(caller.pool.modes).map(tool=>ToolSchema.parse(toolDescriptor(tool)))};
  });
  server.setRequestHandler(CallToolRequestSchema, async request => {
   const caller = this.context.getStore();
   if (!caller) throw new Error('Missing authenticated MCP request context.');
   const tool = listedTools(caller.pool.modes).find(candidate=>candidate.name===request.params.name);
   if (!tool) {
    console.info({event:'mcp.refused',poolId:caller.pool.id,reason:'unknown_tool'});
    throw new McpError(ErrorCode.InvalidParams,'Unknown tool.');
   }
   const input = tool.input.safeParse(request.params.arguments ?? {});
   if (input.success && tool.name==='opintel.describe' && this.describeTool) {
    try {
     const result = await this.describeTool.describe(caller,input.data);
     if (result.ok) return {content:[{type:'text' as const,text:JSON.stringify(result.value)}],structuredContent:result.value};
     console.info({event:'mcp.refused',poolId:caller.pool.id,reason:result.error.code});
     return {isError:true,content:[{type:'text' as const,text:result.error.message}],_meta:{code:result.error.code}};
    } catch {
     console.info({event:'mcp.refused',poolId:caller.pool.id,reason:'dependency_unavailable'});
     return {isError:true,content:[{type:'text' as const,text:'The pool description is unavailable.'}],_meta:{code:'dependency_unavailable'}};
    }
   }
   const code = input.success ? 'dependency_unavailable' : 'validation_failed';
   const message = input.success ? 'This tool is not available in this deployment yet.' : 'The tool arguments do not match its schema.';
   console.info({event:'mcp.refused',poolId:caller.pool.id,reason:code});
   return {isError:true,content:[{type:'text' as const,text:message}],_meta:{code}};
  });
  await server.connect(transport);
  return session;
 }
 async handle(request: IncomingMessage, response: ServerResponse, requestId: string): Promise<void> {
  let created: Session | undefined;
  try {
   const rawProject = new URL(request.url ?? '/', 'http://localhost').pathname.match(/^\/mcp\/v1\/p\/([^/]+)$/u)?.[1];
   const project = z.uuid().safeParse(rawProject);
   if (!project.success) { this.failure(response,requestId,401,'unauthenticated','The pool key is not valid.'); return; }
   const auth = await this.access.authenticate(ProjectId(project.data),request.headers.authorization,request.headers['x-opintel-agent-id']);
   if (!auth.ok) { this.failure(response,requestId,auth.error.code==='unauthenticated'?401:400,auth.error.code,auth.error.message); return; }
   // Browser origins are never needed by this bearer-authenticated agent endpoint.
   // Reject them rather than accepting a cross-origin request by default.
   if (request.headers.origin) { this.failure(response,requestId,403,'forbidden','Browser origins are not accepted by the agent interface.'); return; }
   const principal = auth.value;
   const id = request.headers['mcp-session-id'];
   let session = typeof id==='string' ? this.sessions.get(id) : undefined;
   if (id !== undefined && (!session || session.principal.pool.id!==principal.pool.id || session.principal.pool.projectId!==principal.pool.projectId)) {
    this.failure(response,requestId,404,'not_found','The MCP session was not found.'); return;
   }
   let body: unknown;
   if (request.method==='POST') {
    const chunks: Buffer[]=[]; let size=0;
    for await (const chunk of request) {
     const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=bytes.length;
     if (size>1024*1024) { this.failure(response,requestId,413,'validation_failed','The MCP request is too large.'); return; }
     chunks.push(bytes);
    }
    try { body=JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
    catch { this.failure(response,requestId,400,'validation_failed','Request body is not valid JSON.'); return; }
   }
   const message = JSONRPCMessageSchema.safeParse(body);
   if (!session) {
    if (request.method!=='POST' || !isInitializeRequest(body)) { this.failure(response,requestId,400,'validation_failed','Initialize an MCP session first.'); return; }
    session = created = await this.create(principal);
   }
   if (message.success) {
    const method = 'method' in message.data ? message.data.method : undefined;
    const kind = method==='initialize'?'connect':method==='ping'||method===undefined?'heartbeat':'request';
    const client = session.server.getClientVersion()?.name ?? null;
    const presence = await this.access.observe(principal,kind,client);
    if (!presence.ok) { this.failure(response,requestId,presence.error.code==='unauthenticated'?401:400,presence.error.code,presence.error.message); return; }
   }
   // The caller id is observational; changing it never changes session access.
   session.principal = principal;
   response.setHeader('cache-control','no-store');
   await this.context.run(principal,()=>session!.transport.handleRequest(request,response,body));
  } catch {
   if (!response.headersSent) this.failure(response,requestId,503,'dependency_unavailable','The agent interface is temporarily unavailable.');
   else response.end();
  } finally {
   if (created && !created.transport.sessionId) await created.server.close();
  }
 }
}

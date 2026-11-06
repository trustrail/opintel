import {createSecureServer,type SecureServerOptions,type Http2ServerRequest,type Http2ServerResponse,type ServerHttp2Session} from 'node:http2';
import type {IncomingMessage,ServerResponse,OutgoingHttpHeaders} from 'node:http';
import type {Socket} from 'node:net';
import {engineTransportSettingsFromEnv} from '../engine-transport-settings.js';
export type InternalRequest=IncomingMessage|Http2ServerRequest;
export type InternalResponse=(Omit<ServerResponse,'writeHead'>|Omit<Http2ServerResponse,'writeHead'>)&{writeHead:(status:number,headers?:OutgoingHttpHeaders)=>unknown};
/** Existing private mTLS listeners keep HTTP/1 compatibility for operators. */
export function createInternalH2Server(tls:SecureServerOptions,listener:(request:InternalRequest,response:InternalResponse)=>void,streamTimeoutMs=10000){
 const config=engineTransportSettingsFromEnv(process.env),sockets=new Set<Socket>(),sessions=new Set<ServerHttp2Session>();
 const server=createSecureServer({...tls,allowHTTP1:true,settings:{...tls.settings,maxConcurrentStreams:config.maxConcurrentStreams}},(request,response)=>{
  if(request.httpVersionMajor===2)request.setTimeout(streamTimeoutMs,()=>request.destroy());
  listener(request,response);
 });
 server.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
 server.setTimeout(config.idleTimeoutMs);
 server.on('session',session=>{sessions.add(session);session.once('close',()=>sessions.delete(session));session.on('timeout',()=>session.close());});
 const close=server.close.bind(server);
 return Object.assign(server,{close:(callback?:()=>void)=>{for(const session of sessions)session.close();return close(callback);},requestTimeout:10000,headersTimeout:10000,keepAliveTimeout:config.idleTimeoutMs,closeAllConnections:()=>{for(const socket of sockets)socket.destroy();}});
}

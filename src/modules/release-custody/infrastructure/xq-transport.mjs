import {URL} from 'node:url';
import {Buffer} from 'node:buffer';
import {setTimeout,clearTimeout} from 'node:timers';
const {AbortSignal}=globalThis;
import {request as httpsRequest} from 'node:https';
import {request as httpRequest} from 'node:http';

/** No headers or body are written until connection setup completes. Each subcall
 * has one shared deadline and at most one recovery; response failures never retry. */
export async function xqRequest(url,options,body,{deadlineMs=15000,connectTimeoutMs=1000,lookup}={}){
 const target=new URL(url),signal=AbortSignal.timeout(deadlineMs);
 if(!['https:','http:'].includes(target.protocol))throw new Error('Unsupported provider transport.');
 for(let attempt=1;;attempt++){
  let written=false;
  try{
   const response=await new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(error,value)=>{if(settled)return;settled=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
    const request=target.protocol==='https:'?httpsRequest:httpRequest;
    const req=request(target,{...options,headers:{...options.headers,...(body===undefined?{}:{'content-length':String(Buffer.byteLength(body))})},signal,agent:false,...(lookup?{lookup}:{})},res=>{
     const chunks=[];let bytes=0;
     res.on('data',chunk=>{bytes+=chunk.length;if(bytes>1048576){res.destroy();finish(Object.assign(new Error('Provider response exceeded its bound.'),{code:'RESPONSE_OVERSIZED'}));}else chunks.push(chunk);});
     res.once('error',error=>finish(error));
     res.once('end',()=>finish(undefined,{status:res.statusCode??0,text:Buffer.concat(chunks).toString('utf8'),attempt}));
    });
    req.once('error',error=>finish(error));
    req.once('socket',socket=>{
     socket.once(target.protocol==='https:'?'secureConnect':'connect',()=>{
      if(settled||req.destroyed||signal.aborted)return;
      clearTimeout(timer);written=true;req.end(body);
     });
    });
    timer=setTimeout(()=>req.destroy(Object.assign(new Error('Provider connection setup timed out.'),{code:'ETIMEDOUT'})),connectTimeoutMs);
   });
   return response;
  }catch(error){
   const code=error?.code;
   const retryable=['ETIMEDOUT','ECONNRESET','ECONNREFUSED','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN'].includes(code);
   if(attempt===1&&!written&&!signal.aborted&&retryable)continue;
   throw Object.assign(new Error('Provider transport failed.'),{kind:signal.aborted||code==='ETIMEDOUT'?'deadline_exceeded':'unreachable',attempt,written});
  }
 }
}

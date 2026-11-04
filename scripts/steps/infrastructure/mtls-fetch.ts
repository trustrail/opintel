import {request} from 'node:https';
import {Readable} from 'node:stream';
/** Agent-only HTTPS adapter. Uses Node's normal trust verification, plus the
 * agent's client identity. Never forwards credentials across an HTTP redirect. */
export function mtlsFetch(certificate:string,key:string|Buffer):typeof fetch{
 return async(input,init)=>{
  const original=input instanceof Request?input:undefined,url=new URL(original?.url??String(input));
  if(url.protocol!=='https:')throw new Error('Identity-bound MCP requires HTTPS.');
  const headers=new Headers(init?.headers??original?.headers),method=init?.method??original?.method??'GET',body=init?.body??(original?await original.text():undefined);
  if(body!==undefined&&body!==null&&typeof body!=='string')throw new Error('Unsupported MCP request body.');
  return new Promise<Response>((resolve,reject)=>{
   const req=request(url,{method,headers:Object.fromEntries(headers),cert:certificate,key,agent:false,signal:init?.signal??original?.signal},res=>{
    const responseHeaders=new Headers();for(let i=0;i<res.rawHeaders.length;i+=2)responseHeaders.append(res.rawHeaders[i]!,res.rawHeaders[i+1]!);
    if(res.statusCode&&res.statusCode>=300&&res.statusCode<400){res.resume();reject(new Error('MCP redirects are not permitted.'));return;}
    const stream=[204,205,304].includes(res.statusCode??0)||method==='HEAD'?null:Readable.toWeb(res) as ReadableStream<Uint8Array>;
    resolve(new Response(stream,{status:res.statusCode??500,headers:responseHeaders}));
   });req.on('error',reject);req.end(body??undefined);
  });
 };
}

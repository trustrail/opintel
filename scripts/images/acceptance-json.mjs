import {Buffer} from 'node:buffer';
/** Node does not infer body framing for DELETE. Always frame JSON explicitly,
 * including non-ASCII input, just as the public browser fetch client does. */
export function acceptanceJson(body,headers={}){
 const payload=body===undefined?undefined:JSON.stringify(body);
 return {payload,headers:{...headers,...(payload===undefined?{}:{'content-length':String(Buffer.byteLength(payload))})}};
}
export function acceptanceRequest(path,base,body,cookie,headers={}){
 const agent=path.startsWith('/mcp/v1/');
 return acceptanceJson(body,{...(!agent?{origin:base}:{}),'content-type':'application/json',...(!agent&&cookie?{cookie}:{}),...headers});
}

// Override the global Agent's five-second idle timeout with the already-declared
// request deadline. The abort signal remains the end-to-end bound.
export const acceptanceDeadlineMs=30000;

import process from 'node:process';
import console from 'node:console';
import {spawnSync} from 'node:child_process';

const image=process.argv[2],platform=process.argv[3];
if(!image||!platform)throw new Error('Supply API image and platform.');
// No provider credentials, external network or mounted checkout. A successful
// mock request proves the worker imported its SDK rather than swallowing an
// import failure as an unreachable provider.
const probe=`
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {Worker} from 'node:worker_threads';
const require=createRequire(import.meta.url);
assert.equal(require('/work/native/duckdb.node').library_version(),'v1.5.6');
let requests=0;
const server=createServer((request,response)=>{requests++;response.writeHead(200);response.end('{}');});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const endpoint='http://127.0.0.1:'+server.address().port;
const worker=new Worker('/work/src/platform/http/xq-worker.mjs',{execArgv:[],workerData:{operation:'health',configuration:{apiKey:'synthetic',senderAlias:'synthetic',senderAccessToken:'synthetic',validationUrl:endpoint,subscriptionUrl:endpoint,dashboardUrl:endpoint}}});
const deadline=setTimeout(()=>{console.error('Packaged worker timed out');process.exit(1);},20000);
try{
 const result=await new Promise((resolve,reject)=>{worker.once('message',resolve);worker.once('error',reject);worker.once('exit',code=>{if(code!==0)reject(new Error('Worker exited '+code));});});
 assert.equal(requests,1);assert.equal(result.ok,true);assert.equal(result.value.reachable,true);assert.equal(result.value.authenticated,true);
 console.log('Packaged native binding and XQ worker passed without source or node_modules.');
}finally{clearTimeout(deadline);await worker.terminate();await new Promise(resolve=>server.close(resolve));}
`;
const result=spawnSync('docker',['run','--rm','--platform',platform,'--network','none','--read-only','-i',image,'node','--input-type=module'],{input:probe,encoding:'utf8',timeout:60000});
if(result.stdout)console.log(result.stdout.trim());
if(result.error||result.status!==0)throw new Error(result.error?.message??result.stderr??`Runtime smoke exited ${result.status}`);

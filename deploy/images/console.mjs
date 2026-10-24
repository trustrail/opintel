import {createServer as httpServer,request as httpRequest} from 'node:http';
import {createServer as httpsServer,request as httpsRequest} from 'node:https';
import {createReadStream} from 'node:fs';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname,sep,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import process from 'node:process';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
export function createConsoleServer({root=resolve('dist'),upstream=new URL('http://api:3000'),tls}={}){
 if(!['http:','https:'].includes(upstream.protocol)||upstream.username||upstream.password)throw new Error('API_UPSTREAM must be an HTTP(S) URL without credentials.');
 const request=upstream.protocol==='https:'?httpsRequest:httpRequest;
 const handle=async(req,res)=>{
 const parsed=new URL(req.url??'/','http://localhost'),path=parsed.pathname;
 // Callback/confirm-device are browser pages. Only OIDC transport belongs to
 // the API under /auth, matching the development proxy boundary.
 if(path==='/healthz'||/^\/(?:api|mcp)(?:\/|$)/u.test(path)||/^\/auth\/oidc(?:\/|$)/u.test(path)){
  const proxy=request(new URL(parsed.pathname+parsed.search,upstream),{method:req.method,headers:req.headers},response=>{res.writeHead(response.statusCode??502,response.headers);response.pipe(res);});
  res.on('close',()=>proxy.destroy());
  proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});req.pipe(proxy);return;
 }
 try{
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  let file=resolve(root,'.'+decodeURIComponent(path));
  if(file!==root&&!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}
  try{if(!(await stat(file)).isFile())throw new Error('Not a file');}catch{if(path.startsWith('/assets/')){res.writeHead(404);res.end();return;}file=resolve(root,'index.html');}
  res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});
  if(req.method==='HEAD')res.end();else createReadStream(file).pipe(res);
 }catch{res.writeHead(400);res.end();}
 };
 return tls?httpsServer({...tls,minVersion:'TLSv1.3'},handle):httpServer(handle);
}
async function main(){
 let tls;
 if(process.env.CONSOLE_TLS_CONFIG_FILE){
  const file=resolve(process.env.CONSOLE_TLS_CONFIG_FILE);
  const config=z.strictObject({certFile:z.string().min(1),keyFile:z.string().min(1)}).parse(JSON.parse(await readFile(file,'utf8')));
  tls={cert:await readFile(resolve(dirname(file),config.certFile)),key:await readFile(resolve(dirname(file),config.keyFile))};
 }
 const port=z.coerce.number().int().min(1).max(65535).parse(process.env.PORT??8080);
 createConsoleServer({upstream:new URL(process.env.API_UPSTREAM??'http://api:3000'),tls}).listen(port,'0.0.0.0');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void main().catch(()=>{process.stderr.write('Console startup failed. Check API_UPSTREAM, PORT and the configured TLS files.\n',()=>process.exit(1));});

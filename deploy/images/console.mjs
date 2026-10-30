import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {z} from 'zod';
import process from 'node:process';
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
// Standalone public static-service routes; no authenticated application data.
export const consoleRoutes=[{path:'/healthz',permission:'public'},{path:'/deployment.json',permission:'public'}];
export function createConsoleServer({root=resolve('dist'),read=createReadStream}={}){
 return createServer(async(req,res)=>{
  const failed=()=>{console.error({event:'console.static_read_failed',timestamp:new Date().toISOString()});if(!res.headersSent){res.writeHead(500);res.end();}else res.destroy();};
  let path;
  try{path=decodeURIComponent(new URL(req.url??'/','http://localhost').pathname);}catch{res.writeHead(400);res.end();return;}
  if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
  const publicRoute=consoleRoutes.find(route=>route.path===path&&route.permission==='public');
  if(publicRoute?.path==='/deployment.json'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify({selfSignedTls:!process.env.CONSOLE_EXTERNAL_TLS}));return;}
  if(publicRoute?.path==='/healthz'){res.writeHead(200);res.end('ok');return;}
  try{
   const fallback=resolve(root,path==='/console-next'||path.startsWith('/console-next/')?'console-next/index.html':'index.html');
   let file=resolve(root,'.'+path);
   if(file!==root&&!file.startsWith(root+sep)){res.writeHead(404);res.end();return;}
   try{if(!(await stat(file)).isFile())file=fallback;}catch(error){
    if(error.code!=='ENOENT'&&error.code!=='ENOTDIR'){failed();return;}
    if(extname(path)||path.startsWith('/assets/')){res.writeHead(404);res.end();return;}
    file=fallback;
   }
   const stream=read(file);
   stream.once('error',failed);
   res.once('close',()=>stream.destroy());
   stream.once('open',()=>{
    if(res.destroyed){stream.destroy();return;}
    res.writeHead(200,{'content-type':types[extname(file)]??'application/octet-stream','cache-control':file.endsWith('index.html')?'no-cache':'public, max-age=3600'});
    if(req.method==='HEAD'){stream.destroy();res.end();}else stream.pipe(res);
   });
  }catch{failed();}
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=z.coerce.number().int().min(1).max(65535).parse(process.env.PORT??8080);
 createConsoleServer().listen(port,'0.0.0.0');
}

import {createServer,request} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import process from 'node:process';
const root=resolve('dist'),upstream=new URL(process.env.API_UPSTREAM??'http://api:3000');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2'};
createServer(async(req,res)=>{
 const parsed=new URL(req.url??'/','http://localhost'),path=parsed.pathname;
 if(/^\/(?:api|auth|mcp)(?:\/|$)/u.test(path)){
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
}).listen(8080,'0.0.0.0');

import {it,expect} from 'vitest';
import {execFileSync,spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {setTimeout} from 'node:timers/promises';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
it('bundled companion starts in probe mode without credentials and refuses every tool',async()=>{
 const directory=mkdtempSync(join(tmpdir(),'companion-runtime-'));let child;const client=new Client({name:'probe-test',version:'1'});
 try{
  execFileSync(process.execPath,['scripts/engine-package/bundle.mjs','companion',directory],{stdio:'pipe'});
  const listener=createServer();await new Promise(resolve=>listener.listen(0,'127.0.0.1',resolve));const port=listener.address().port;await new Promise(resolve=>listener.close(resolve));
  child=spawn(process.execPath,[join(directory,'scripts/companion/main.js')],{env:{PATH:process.env.PATH,NODE_ENV:'production',MCP_PORT:String(port),AP_PROBE_MODE:'1',OPINTEL_AGENT_CREDENTIAL:'malformed'},stdio:'pipe'});let diagnostic='';child.stderr.on('data',data=>{diagnostic+=data;});
  let ready=false;for(let attempt=0;attempt<100;attempt++){if(child.exitCode!==null)throw new Error('Bundled probe exited: '+diagnostic);try{ready=(await fetch(`http://127.0.0.1:${port}/healthz`)).ok;}catch{}if(ready)break;await setTimeout(50);}expect(ready).toBe(true);
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`)));expect((await client.listTools()).tools.map(t=>t.name).sort()).toEqual(['opintel_describe','opintel_query','opintel_unseal']);
  for(const [name,args] of [['opintel_describe',{}],['opintel_query',{sql:'SELECT 1'}],['opintel_unseal',{evidenceId:'fixture'}]])expect((await client.callTool({name,arguments:args})).structuredContent).toEqual({refused:true,code:'probe_mode'});
 }finally{await client.close();if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}rmSync(directory,{recursive:true,force:true});}
},30000);

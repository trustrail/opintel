import console from 'node:console';
import process from 'node:process';
import {setTimeout} from 'node:timers';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gateContainerLabels} from './gate-containers.mjs';
const dependencies=dirname(dirname(fileURLToPath(import.meta.resolve('playwright/package.json'))));
const version=JSON.parse(readFileSync('package-lock.json','utf8')).packages['node_modules/@playwright/test'].version;
const name='opintel-smoke-browser-'+randomUUID();
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||'Docker browser failed');return r.stdout.trim();}
try{
 docker(['run','--detach','--init','--ipc=host','--name',name,...gateContainerLabels(),'--publish','127.0.0.1::3000','--mount',`type=bind,source=${dependencies},target=/app/node_modules,readonly`,`mcr.microsoft.com/playwright:v${version}-noble`,'node','/app/node_modules/playwright/cli.js','run-server','--host','0.0.0.0','--port','3000']);
 const address=docker(['port',name,'3000/tcp']);
 const until=Date.now()+120000;let ready=false;
 while(Date.now()<until){if(docker(['inspect','--format','{{.State.Running}}',name])!=='true')throw new Error(docker(['logs',name])||'Browser server exited');if(docker(['logs',name]).includes('Listening on')){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw new Error('Pinned browser server did not become ready.');
 const result=spawnSync('npx',['playwright','test','--config=playwright.smoke.config.ts'],{stdio:'inherit',env:{...process.env,OPINTEL_SMOKE_BROWSER_WS:`ws://${address}/`}});
 process.exitCode=result.status??1;
}finally{const cleanup=spawnSync('docker',['rm','--force',name],{encoding:'utf8'});if(cleanup.status!==0)console.error('Smoke browser cleanup failed.');}

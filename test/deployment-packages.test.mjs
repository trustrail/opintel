import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {afterEach,expect,it} from 'vitest';
import {packageDeployment} from '../scripts/images/package.mjs';
const cleanup=[];
afterEach(()=>{for(const directory of cleanup.splice(0))rmSync(directory,{recursive:true,force:true});});
function environment(values){
 const directory=mkdtempSync(join(tmpdir(),'opintel-package-'));cleanup.push(directory);
 const file=join(directory,'package.env');writeFileSync(file,Object.entries({PLATFORM:'linux/amd64',...values}).map(([key,value])=>key+'='+value).join('\n')+'\n');return file;
}
const image='ghcr.io/trustrail/opintel-console@sha256:'+'a'.repeat(64);
it('DEP-004: console resolves independently without database, engine or other-service configuration',()=>{
 const file=environment({GATEWAY_CONSOLE_IMAGE:image,GATEWAY_API_UPSTREAM:'https://api.customer.example:8443',GATEWAY_CONSOLE_CONFIG_DIRECTORY:'/operator/console'});
 const result=JSON.parse(execFileSync('docker',['compose','--env-file',file,'-p','package-test-gateway','-f','deploy/gateway/services/console.json','config','--format','json'],{encoding:'utf8'}));
 expect(Object.keys(result.services)).toEqual(['console']);
 expect(result.services.console.environment.API_UPSTREAM).toBe('https://api.customer.example:8443');
 expect(result.services.console.depends_on).toBeUndefined();
 expect(result.services.console.platform).toBe('linux/amd64');
 expect(result.services.console.image).toBe(image);
});
it('DEP-004: every gateway service is independently selectable with no implicit startup graph',()=>{
 for(const name of ['api','console','postgres','redis','spicedb','spicedb-postgres','spicedb-migrate','migrations','schema','owner-claim']){
  const config=JSON.parse(readFileSync(`deploy/gateway/services/${name}.json`,'utf8'));
  expect(Object.keys(config.services)).toEqual([name]);
  expect(config.services[name].depends_on).toBeUndefined();
  if(name==='api'){
   expect(config.services.api.environment.ENGINE_HEARTBEAT_URL).toBe('${GATEWAY_HEARTBEAT_URL:?set explicit gateway HTTPS heartbeat address}');
   expect(config.services.api.environment.ENGINE_HEARTBEAT_HOST).toBe('0.0.0.0');
   expect(config.services.api.environment.ENGINE_HEARTBEAT_PORT).toBe('3102');
   for(const key of ['ENGINE_HEARTBEAT_URL','ENGINE_HEARTBEAT_HOST','ENGINE_HEARTBEAT_PORT'])delete config.services.api.environment[key];
  }
  expect(JSON.stringify(config)).not.toMatch(/ENGINE_|service:egress|external.*true/u);
 }
});
it('DEP-004/005: engine namespace and storage stay local; restart ownership remains supervised',()=>{
 const config=JSON.parse(readFileSync('deploy/engine-package/services/engine.json','utf8')).services.engine;
 expect(config.network_mode).toBe('container:${ENGINE_NETWORK_CONTAINER:?start local egress companion first}');
 expect(config.restart).toBe('no');expect(config.read_only).toBe(true);expect(config.cap_drop).toEqual(['ALL']);
 expect(config.mem_limit).toBe(config.memswap_limit);
 expect(JSON.stringify(config)).not.toMatch(/GATEWAY_|external.*true/u);
});
it('DEP-004: package wrapper refuses a mutable tag before starting a container',()=>{
 const file=environment({GATEWAY_CONSOLE_IMAGE:'opintel-console:latest',GATEWAY_API_UPSTREAM:'https://api.customer.example',GATEWAY_CONSOLE_CONFIG_DIRECTORY:'/operator/console'});
 expect(()=>execFileSync('bash',[resolve('deploy/gateway/gateway.sh'),'--env-file',file,'start','console'],{encoding:'utf8',stdio:'pipe'})).toThrow('Every package image must be pinned by digest');
});
it('DEP-004: assembled packages resolve without their original checkout and contain literal digests',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-assembled-'));cleanup.push(directory);
 const destination=join(directory,'release');
 const manifest={revision:'a'.repeat(40),upstream:JSON.parse(readFileSync('deploy/images/upstream.json','utf8')),artifacts:['api','console','engine','egress','migrations','provisioning'].map(target=>({target,platform:'linux/arm64',repoDigests:[`ghcr.io/trustrail/opintel-${target}@sha256:${'b'.repeat(64)}`]}))};
 packageDeployment(manifest,destination,'linux/arm64');
 const file=environment({GATEWAY_POSTGRES_PASSWORD_FILE:'/operator/password'});
 const result=JSON.parse(execFileSync('docker',['compose','--env-file',file,'-p','assembled-test','-f',join(destination,'gateway/services/postgres.json'),'config','--format','json'],{cwd:directory,encoding:'utf8'}));
 expect(result.services.postgres.platform).toBe('linux/arm64');
 expect(result.services.postgres.image).toBe(manifest.upstream.services.postgres.image);
 const engine=JSON.parse(readFileSync(join(destination,'engine/services/engine.json'),'utf8'));
 expect(engine.services.engine.image).toBe(`ghcr.io/trustrail/opintel-engine@sha256:${'b'.repeat(64)}`);
 expect(()=>packageDeployment({...manifest,dirty:true},join(directory,'dirty'),'linux/arm64')).toThrow('Dirty candidate');
 expect(()=>packageDeployment({...manifest,artifacts:[]},join(directory,'missing'),'linux/arm64')).toThrow('Missing or ambiguous');
});

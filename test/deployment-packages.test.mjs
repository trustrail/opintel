import {readdirSync,readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
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
 expect(result.services.console.environment.CONSOLE_EXTERNAL_TLS).toBe('');expect(result.services.console.ports).toBeUndefined();
 expect(result.services.console.depends_on).toBeUndefined();
 expect(result.services.console.platform).toBe('linux/amd64');
 expect(result.services.console.image).toBe(image);
});
it('DEP-004: every gateway service is independently selectable with no implicit startup graph',()=>{
 for(const name of ['api','console','ingress','postgres','redis','spicedb','spicedb-postgres','spicedb-migrate','migrations','schema','owner-claim','operator']){
  const config=JSON.parse(readFileSync(`deploy/gateway/services/${name}.json`,'utf8'));
  expect(Object.keys(config.services)).toEqual([name]);
  expect(config.services[name].depends_on).toBeUndefined();
  if(name==='api'){
   expect(config.services.api.environment.ENGINE_HEARTBEAT_URL).toBe('${GATEWAY_HEARTBEAT_URL:?set explicit gateway HTTPS heartbeat address}');
   expect(config.services.api.environment.ENGINE_HEARTBEAT_HOST).toBe('0.0.0.0');
   expect(config.services.api.environment.ENGINE_HEARTBEAT_PORT).toBe('3102');
   for(const key of ['ENGINE_HEARTBEAT_URL','ENGINE_HEARTBEAT_HOST','ENGINE_HEARTBEAT_PORT'])delete config.services.api.environment[key];
  }
  if(name==='operator'){expect(config.services[name].environment.ENGINE_HEARTBEAT_URL).toBe('${GATEWAY_HEARTBEAT_URL:?set explicit gateway HTTPS heartbeat address}');delete config.services[name].environment.ENGINE_HEARTBEAT_URL;}
  expect(JSON.stringify(config)).not.toMatch(/ENGINE_|service:egress|external.*true/u);
 }
});
it('DEP-004/005: engine namespace and storage stay local; restart ownership remains supervised',()=>{
 const config=JSON.parse(readFileSync('deploy/engine-package/services/engine.json','utf8')).services.engine;
 expect(config.network_mode).toBe('container:${ENGINE_NETWORK_CONTAINER:?start local egress companion first}');
 expect(config.restart).toBe('unless-stopped');expect(config.healthcheck).toBeDefined();expect(config.read_only).toBe(true);expect(config.cap_drop).toEqual(['ALL']);
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
 const manifest={revision:'a'.repeat(40),upstream:JSON.parse(readFileSync('deploy/images/upstream.json','utf8')),artifacts:['api','console','engine','egress','migrations','provisioning','demo-tools','agent-kit'].map(target=>({target,platform:'linux/arm64',repoDigests:[`ghcr.io/trustrail/opintel-${target}@sha256:${'b'.repeat(64)}`]}))};
 packageDeployment(manifest,destination,'linux/arm64');
 const file=environment({GATEWAY_POSTGRES_PASSWORD_FILE:'/operator/password'});
 const result=JSON.parse(execFileSync('docker',['compose','--env-file',file,'-p','assembled-test','-f',join(destination,'gateway/services/postgres.json'),'config','--format','json'],{cwd:directory,encoding:'utf8'}));
 expect(result.services.postgres.platform).toBe('linux/arm64');
 expect(result.services.postgres.image).toBe(manifest.upstream.services.postgres.image);
 const engine=JSON.parse(readFileSync(join(destination,'engine/services/engine.json'),'utf8'));
 for(const kind of ['gateway','engine'])expect(Object.keys(JSON.parse(readFileSync(join(destination,kind,'release.json'),'utf8')).images)).not.toContain('demo-tools');
 expect(Object.keys(JSON.parse(readFileSync(join(destination,'agent-kit/release.json'),'utf8')).images)).toEqual(['agent-kit']);
 expect(Object.keys(JSON.parse(readFileSync(join(destination,'verification/release.json'),'utf8')).images)).toEqual(['demo-tools']);
 expect(engine.services.engine.image).toBe(`ghcr.io/trustrail/opintel-engine@sha256:${'b'.repeat(64)}`);
 expect(()=>packageDeployment({...manifest,dirty:true},join(directory,'dirty'),'linux/arm64')).toThrow('Dirty candidate');
 expect(()=>packageDeployment({...manifest,artifacts:[]},join(directory,'missing'),'linux/arm64')).toThrow('Missing or ambiguous');
});

it('DEP-009/011: application operator jobs receive no agent bundles; verification jobs are in their own package',()=>{
 const provision=JSON.parse(readFileSync('deploy/gateway/services/operator.json','utf8')).services.operator;
 const demo=JSON.parse(readFileSync('deploy/verification/services/demo-tools.json','utf8')).services['demo-tools'];
 expect(provision.volumes.some(v=>v.includes('.xq'))).toBe(false);
 expect(demo.volumes).toContain('${VERIFICATION_IDENTITIES_DIRECTORY:?set agent certificate directory}:/home/operator/.xq:ro');
 expect(provision.env_file).toEqual(['${GATEWAY_OPERATOR_ENV_FILE:?set operator job environment}']);
 expect(demo.env_file).toEqual(['${VERIFICATION_ENV_FILE:?set private verification configuration}']);
 for(const job of [provision,demo]){expect(job.read_only).toBe(true);expect(job.restart).toBe('no');}
 expect(provision.volumes).toContain('${GATEWAY_OPERATOR_OUTPUT_DIRECTORY:?set private output directory}:/output');
 expect(demo.volumes).toContain('${VERIFICATION_OUTPUT_DIRECTORY:?set private output directory}:/output');
 expect(demo.tmpfs[0]).toMatch(/^\/tmp:rw,noexec,nosuid,nodev,/u);
});

it('DEP-016: ingress certificate paths take precedence and fallback is isolated',()=>{
 const file=environment({GATEWAY_CONFIG_DIRECTORY:'/operator/config',GATEWAY_INGRESS_CONFIG_FILE:'/package/ingress/nginx.conf',GATEWAY_INGRESS_CERT_FILE:'/operator/external/fullchain.pem',GATEWAY_INGRESS_KEY_FILE:'/operator/external/key.pem'});
 const config=JSON.parse(execFileSync('docker',['compose','--env-file',file,'-p','tls-package-test','-f','deploy/gateway/services/ingress.json','config','--format','json'],{encoding:'utf8'}));
 expect(config.services.ingress.volumes.map(v=>v.source)).toContain('/operator/external/fullchain.pem');
 expect(config.services.ingress.volumes.map(v=>v.source)).toContain('/operator/external/key.pem');
 const fallback=environment({GATEWAY_CONFIG_DIRECTORY:'/operator/config',GATEWAY_INGRESS_CONFIG_FILE:'/package/ingress/nginx.conf'});
 const other=JSON.parse(execFileSync('docker',['compose','--env-file',fallback,'-p','tls-fallback-test','-f','deploy/gateway/services/ingress.json','config','--format','json'],{encoding:'utf8'}));
 expect(other.services.ingress.volumes.map(v=>v.source)).toContain('/operator/config/ingress-tls/server.pem');
 expect(other.services.ingress.restart).toBe('unless-stopped');expect(other.services.ingress.healthcheck).toBeDefined();
});

it('agent-kit-only packaging needs only its audited image and includes no identity state',()=>{
 const directory=mkdtempSync(join(tmpdir(),'opintel-agent-only-'));cleanup.push(directory);const destination=join(directory,'release');
 const manifest={revision:'a'.repeat(40),upstream:JSON.parse(readFileSync('deploy/images/upstream.json','utf8')),artifacts:[{target:'agent-kit',platform:'linux/amd64',repoDigests:['ghcr.io/trustrail/opintel-agent-kit@sha256:'+'b'.repeat(64)]}]};
 packageDeployment(manifest,destination,'linux/amd64',{kind:'agent-kit'});
 expect(readdirSync(destination)).toEqual(['agent-kit']);expect(readdirSync(join(destination,'agent-kit'))).toEqual(['release.json']);
});

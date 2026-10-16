import {generateKeyPairSync,randomUUID,randomBytes} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {runXqIntegration,readIntegrationConfig,type XqIntegrationConfig,type XqIntegrationPort,reportMarkdown,reportExitCode} from '../scripts/xq-integration.js';
import {signGrant,sealCell,xorShares} from '../src/modules/release-custody/index.js';
import type {ReleaseClaims} from '../src/shared/release-contract.js';
const project=randomUUID(),pool=randomUUID(),decision=randomUUID(),receipt=randomUUID(),grantId=randomUUID();
const c:XqIntegrationConfig={OPINTEL_API_BASE_URL:'http://localhost:3000',OPINTEL_XQ_TEST_PROJECT_ID:project,OPINTEL_XQ_TEST_POOL_KEY:'pool-secret',OPINTEL_XQ_API_KEY:'api-secret',OPINTEL_XQ_SENDER_ALIAS:'sender',OPINTEL_XQ_SENDER_ACCESS_TOKEN:'sender-secret',OPINTEL_XQ_REDEEM_URL:'https://xq.invalid/key'};
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync('ed25519'),key=randomBytes(32),first=randomBytes(32),second=xorShares(key,first);
 const claims:ReleaseClaims={iss:project,sub:'agent:'+project+':credential',aud:'xq',jti:grantId,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600,rcpt:receipt,cols:['gross_premium'],custody:{provider:'xq',tenant:'test',provider_redeem_at:c.OPINTEL_XQ_REDEEM_URL,opintel_redeem_at:'http://localhost:3000/mcp/v1/p/'+project,locator:'private-locator'}};
 const grant=signGrant(claims,'test-key',privateKey),sealed=sealCell('12345.67',key,receipt,'gross_premium',0,randomBytes(12));key.fill(0);
 const output={columns:[{name:'gross_premium',type:'DECIMAL(38,9)'}],rows:[[sealed]],truncated:false,evidenceId:receipt,custody:[{columns:['gross_premium'],grant}],rowScopes:[{objectId:randomUUID(),objectName:'demo.public.premiums',poolId:pool,decisionId:decision,decisionIds:[decision],hash:'recorded-hash',columns:['gross_premium'],entitledRows:1,provenance:'agent credential',missingDecision:false}]};
 const description={objects:[{name:'demo.public.premiums',columns:[{name:'gross_premium',type:'DECIMAL(38,9)',treatment:'custody'}],withheld:[] as string[]}],custody:{provider:'xq',tenant:'test',credentialRequired:true,keys:[{...publicKey.export({format:'jwk'}),kid:'test-key',alg:'EdDSA',use:'sig'}]}};
 let redeemed=false;
 const call=vi.fn(async(name:string,_args:Record<string,unknown>):Promise<unknown>=>{if(name==='opintel.describe')return {structuredContent:description};if(name==='opintel.query')return {structuredContent:output};if(redeemed)return {isError:true,_meta:{code:'forbidden'}};redeemed=true;return {structuredContent:{share:second.toString('base64url'),receipt,grantId}};});
 const port={call,authorize:vi.fn(async()=>'recipient-secret'),fetchShare:vi.fn(async()=>first),revoke:vi.fn(async()=>{}),close:vi.fn(async()=>{})} satisfies XqIntegrationPort;
 return {port,output,description,first,claims,privateKey};
}
afterEach(()=>vi.unstubAllEnvs());
it('uses the real signed grant and AES-GCM format, and prints no source values or secrets',async()=>{
 const f=fixture(),r=await runXqIntegration(c,f.port);
 expect(r.results[0]).toMatchObject({receipt,rows:1,decryptedCells:1,outcome:'passed',rowScopes:[{poolId:pool,decisionIds:[decision]}]});expect(reportExitCode(r)).toBe(0);
 expect(JSON.stringify(r)+reportMarkdown(r)).not.toMatch(/12345|pool-secret|api-secret|sender-secret|private-locator|opintelsealed/);
 expect(f.port.call).toHaveBeenCalledWith('opintel.describe',{});
 expect(f.port.call).toHaveBeenCalledWith('opintel.query',{sql:'SELECT "gross_premium" FROM "demo"."public"."premiums" LIMIT 3',maxRows:3});
 expect(f.port.authorize).toHaveBeenCalledWith(f.claims.sub);expect(f.port.fetchShare).toHaveBeenCalledWith('private-locator',f.claims.sub,'recipient-secret');
 expect(f.first.every(b=>b===0)).toBe(true);expect(f.port.close).toHaveBeenCalledOnce();
});
it.each(['cleartext','tampered ciphertext'])('reports custody failure for %s',async kind=>{
 const f=fixture();if(kind==='cleartext')f.output.rows=[['12345.67']];else f.output.rows[0]![0]+='A';
 const r=await runXqIntegration(c,f.port);expect(r.results[0]?.outcome).toBe('failed');expect(reportExitCode(r)).toBe(1);expect(f.port.close).toHaveBeenCalledOnce();
 if(kind==='cleartext'){expect(f.port.fetchShare).not.toHaveBeenCalled();expect(f.port.revoke).toHaveBeenCalledWith('private-locator');}
});
it('does not mistake empty results for a live custody proof',async()=>{const f=fixture();f.output.rows=[];const r=await runXqIntegration(c,f.port);expect(r.results[0]?.outcome).toBe('inconclusive');expect(reportExitCode(r)).toBe(2);expect(f.port.revoke).toHaveBeenCalledOnce();});
it.each(['signature','expiry','project','endpoint','receipt'])('rejects a grant with incorrect %s before contacting XQ',async kind=>{
 const f=fixture();if(kind==='expiry')f.claims.exp=f.claims.iat-1;if(kind==='project')f.claims.iss=randomUUID();if(kind==='endpoint')f.claims.custody.provider_redeem_at='https://elsewhere.invalid/key';if(kind==='receipt')f.claims.rcpt=randomUUID();
 if(kind==='expiry'){f.claims.iat-=100;f.claims.exp=f.claims.iat+1;}
 f.output.custody[0]!.grant=signGrant(f.claims,'test-key',kind==='signature'?generateKeyPairSync('ed25519').privateKey:f.privateKey);
 expect((await runXqIntegration(c,f.port)).results[0]).toMatchObject({outcome:'failed',detail:'custody failed at signed grant'});expect(f.port.authorize).not.toHaveBeenCalled();
});
it('does not mistake a network error for proof of single-use refusal',async()=>{
 const f=fixture(),original=f.port.call.getMockImplementation()!;let redeems=0;
 f.port.call.mockImplementation(async(n,a)=>n==='opintel.redeem'&&++redeems===2?{isError:true,_meta:{code:'dependency_unavailable'}}:original(n,a));
 expect((await runXqIntegration(c,f.port)).results[0]).toMatchObject({outcome:'failed',detail:'custody failed at single-use Opintel redemption'});
});
it('sanitizes provider errors and reports unacknowledged cleanup',async()=>{
 const f=fixture();f.port.fetchShare.mockRejectedValue(new Error('api-secret private-locator 12345.67'));f.port.revoke.mockRejectedValue(new Error('sender-secret'));
 const report=await runXqIntegration(c,f.port);expect(report.results[0]).toMatchObject({outcome:'failed',detail:'custody failed at XQ share retrieval; cleanup unacknowledged'});expect(JSON.stringify(report)).not.toMatch(/api-secret|private-locator|12345|sender-secret/);
 expect(f.port.close).toHaveBeenCalledOnce();
});
it('requires only the endpoint project and pool credential; rejects production endpoints',()=>{
 const env=(v:Record<string,string|undefined>)=>Object.entries(v).filter(([,x])=>x!==undefined).map(([k,x])=>k+'='+x).join('\n');
 expect(readIntegrationConfig(env(c))).toEqual(c);
 expect(readIntegrationConfig(env({OPINTEL_XQ_TEST_PROJECT_ID:project,OPINTEL_XQ_TEST_POOL_KEY:'pool-secret'}))).toMatchObject({OPINTEL_API_BASE_URL:'http://localhost:3000'});
 expect(()=>readIntegrationConfig(env({...c,OPINTEL_API_BASE_URL:'https://production.example'}))).toThrow('OPINTEL_API_BASE_URL');
 vi.stubEnv('NODE_ENV','production');expect(()=>readIntegrationConfig(env(c))).toThrow('development-only');
});

it('discovers multiple objects and every advertised treatment, with separate aggregate denial and delivery probes',async()=>{
 const calls:string[]=[];
 const port:XqIntegrationPort={...fixture().port,call:async(name,args)=>{
  if(name==='opintel.describe')return {structuredContent:{objects:[{name:'one.public.a',columns:[{name:'c',type:'INTEGER',treatment:'clear'},{name:'t',type:'VARCHAR',treatment:'tokenized'},{name:'m',type:'VARCHAR',treatment:'masked'},{name:'a',type:'INTEGER',treatment:'aggregate_only'}],withheld:['w']},{name:'two.public.b',columns:[{name:'different',type:'DATE',treatment:'clear'}],withheld:[]}]}};
  const sql=String(args.sql);calls.push(sql);const column=sql.includes('COUNT(')?'a':sql.split('"')[1]!;
  if(column==='w')return {isError:true,_meta:{code:'element_withheld',evidenceId:receipt}};
  if(column==='a'&&!sql.includes('COUNT('))return {isError:true,_meta:{code:'unsupported_on_aggregate_only',evidenceId:receipt}};
  return {structuredContent:{columns:[{name:column,type:'VARCHAR'}],rows:[[sql.includes('COUNT(')?'1':'hidden sample']],truncated:false,evidenceId:receipt}};
 }};
 const r=await runXqIntegration(c,port);expect(r.objects).toBe(2);expect(r.attributes).toBe(6);expect(r.results).toHaveLength(7);expect(reportExitCode(r)).toBe(0);expect(calls.some(s=>s.includes('"two"."public"."b"'))).toBe(true);expect(r.summary.find(s=>s.treatment==='aggregate_only')).toMatchObject({attributes:1,probes:2,passed:2});expect(JSON.stringify(r)+reportMarkdown(r)).not.toContain('hidden sample');
});
it('continues after a field failure and distinguishes expected refusal from an outage',async()=>{
 const f=fixture();f.description.objects[0]!.withheld=['secret_field'];
 const original=f.port.call.getMockImplementation()!;
 f.port.call.mockImplementation(async(n,a)=>n==='opintel.query'&&String(a.sql).includes('secret_field')?{isError:true,_meta:{code:'dependency_unavailable'}}:original(n,a));
 const r=await runXqIntegration(c,f.port);expect(r.results.map(x=>x.outcome)).toEqual(['passed','failed']);
});
it('reports missing custody credentials as incomplete without creating an escrow',async()=>{const f=fixture();const r=await runXqIntegration({...c,OPINTEL_XQ_API_KEY:''},f.port);expect(r.results[0]?.outcome).toBe('inconclusive');expect(f.port.call).toHaveBeenCalledTimes(1);});
it('does not pass an empty discovery inventory',async()=>{const f=fixture();f.description.objects=[];expect(reportExitCode(await runXqIntegration(c,f.port))).toBe(1);});

it('flags successful withheld reads as defects without retaining their values',async()=>{const f=fixture();f.description.objects[0]!.columns=[];f.description.objects[0]!.withheld=['hidden'];f.port.call.mockImplementation(async n=>n==='opintel.describe'?{structuredContent:f.description}:{structuredContent:{columns:[{name:'hidden',type:'VARCHAR'}],rows:[['source-private-value']],truncated:false,evidenceId:receipt}});const r=await runXqIntegration(c,f.port);expect(r.results[0]).toMatchObject({outcome:'failed',detail:'DEFECT: raw access succeeded'});expect(JSON.stringify(r)).not.toContain('source-private-value');});
it('records aggregate disclosure refusal as inconclusive rather than transport success',async()=>{const f=fixture();f.description.objects[0]!.columns=[{name:'value',type:'INTEGER',treatment:'aggregate_only'}];f.port.call.mockImplementation(async n=>n==='opintel.describe'?{structuredContent:f.description}:{isError:true,_meta:{code:'unsupported_on_aggregate_only'}});const r=await runXqIntegration(c,f.port);expect(r.results.map(x=>x.outcome)).toEqual(['passed','inconclusive']);expect(reportExitCode(r)).toBe(2);});

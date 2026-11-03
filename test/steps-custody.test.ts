import {transportFailure,publicCode,publicCause} from '../scripts/steps/infrastructure/diagnostics.js';
import {it,expect,vi,afterEach} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,readFile,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sealResult} from '../src/shared/infrastructure/sealed-result.js';
import {query,redeem,ResultFile,table,type McpCall} from '../scripts/steps/service.js';
import {ShareRefused} from '../scripts/steps/infrastructure/device.js';
import {run} from '../scripts/steps/main.js';
const mock=vi.hoisted(()=>({call:vi.fn(),close:vi.fn(async()=>{}),device:{exchange:vi.fn(),share:vi.fn(),close:vi.fn()}}));vi.mock('../scripts/steps/infrastructure/mcp.js',()=>({mcpAgent:async()=>mock}));
vi.mock('../scripts/steps/infrastructure/device.js',async importOriginal=>({...await importOriginal<typeof import('../scripts/steps/infrastructure/device.js')>(),deviceAgent:()=>mock.device}));
vi.mock('../scripts/steps/infrastructure/identity.js',()=>({enrollmentIdentity:async()=>({certificate:'fixture',key:'fixture',enrollment:{certificateId:223,deviceName:'device-one',recipientIdentifier:'provider-public-subject'}})}));
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();mock.call.mockReset();mock.device.exchange.mockReset();mock.device.share.mockReset();mock.device.close.mockClear();});
function fixture(){
 const project=randomUUID(),receipt=randomUUID(),grantId=randomUUID(),sealed=sealResult([['custody-original']],['protected'],[0],receipt),claims={iss:project,sub:'agent:credential',aud:'xq',jti:grantId,iat:100,exp:200,rcpt:receipt,cols:['protected'],custody:{provider:'xq',tenant:'test',provider_redeem_at:'https://validation.xqmsg.net/v2/key',locator:'locator',opintel_redeem_at:'https://gateway.example/mcp/v1/p/'+project}};
 const grant=Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify(claims)).toString('base64url')+'.c2lnbmF0dXJl';
 const result={columns:[{name:'visible',type:'VARCHAR'},{name:'token',type:'VARCHAR'},{name:'masked',type:'VARCHAR'},{name:'protected',type:'VARCHAR'}],rows:[['clear-original','opinteltoken:v1:unchanged','***',sealed.rows[0]![0]]],truncated:false,evidenceId:receipt,custody:[{columns:['protected'],grant}]};
 const file:ResultFile={version:1,gateway:'https://gateway.example',project,agentId:'agent-one',result,treatments:{visible:'clear',token:'tokenized',masked:'masked',protected:'custody'}};
 const response={share:sealed.second.toString('base64url'),receipt,grantId};return {...sealed,file,claims,response};
}
it('query prints exactly the received clear/token/mask values, shortens sealed values, and --out retains full grants and sealed values privately',async()=>{
 const f=fixture(),directory=await mkdtemp(join(tmpdir(),'steps-query-'));try{
  const out=join(directory,'result.json'),key=join(directory,'key');await writeFile(key,'opk_live_'+'A'.repeat(22),{mode:0o600});
  mock.call.mockImplementation(async(name:string)=>name==='opintel.query'?{structuredContent:f.file.result}:{structuredContent:{objects:[{name:'warehouse.public.records',rowEstimate:null,columns:Object.entries(f.file.treatments).map(([name,treatment])=>({name,type:'VARCHAR',treatment})),withheld:[]}]}});
  const printed:string[]=[];await run(['query','--gateway',f.file.gateway,'--project',f.file.project,'--key-file',key,'--agent-id','agent-one','--sql','SELECT * FROM warehouse.public.records','--out',out],line=>printed.push(line));
  const text=printed.join('\n');expect(text).toContain('clear-original');expect(text).toContain('opinteltoken:v1:unchanged');expect(text).toContain('***');expect(text).toContain('protected: custody');expect(text).not.toContain(f.file.result.rows[0]![3]);expect(text).not.toContain(f.file.result.custody![0]!.grant);expect(text).not.toContain('opk_live_');
  expect(JSON.parse(await readFile(out,'utf8'))).toMatchObject({result:f.file.result});expect((await stat(out)).mode&0o777).toBe(0o600);
  printed.length=0;await run(['query','--gateway',f.file.gateway,'--project',f.file.project,'--key-file',key,'--agent-id','agent-one','--sql','SELECT * FROM warehouse.public.records','--quiet'],line=>printed.push(line));expect(printed.join('\n')).not.toContain('clear-original');expect(printed.join('\n')).toContain('evidence '+f.file.result.evidenceId);
 }finally{f.first.fill(0);f.second.fill(0);await rm(directory,{recursive:true,force:true});}
});
it('aliases and expressions are never assigned a treatment by guessing from a matching output name',async()=>{
 const f=fixture();try{const call: McpCall=async()=>({structuredContent:f.file.result});const result=await query(call,'SELECT lower(visible) AS visible FROM warehouse.public.records');expect(result.treatments.visible).toBe('not reported');expect(result.treatments.protected).toBe('custody');}finally{f.first.fill(0);f.second.fill(0);}
});
it('both shares recover independent fixture values; repeated redemption is refused without fetching K1 or unsealing again',async()=>{
 const f=fixture();let used=false;const first=vi.fn(async()=>Buffer.from(f.first)),call:McpCall=async()=>{if(used)return {isError:true,_meta:{code:'forbidden',cause:'release_refused'}};used=true;return {structuredContent:f.response};};
 try{const result=await redeem(f.file,call,first);expect(result.rows).toEqual([['clear-original','opinteltoken:v1:unchanged','***','custody-original']]);expect(result.receiptState).toBe('redeemed');expect(table({...f.file.result,rows:result.rows})).toContain('custody-original');await expect(redeem(f.file,call,first)).rejects.toMatchObject({share:'K2',cause:expect.stringContaining('already redeemed')});expect(first).toHaveBeenCalledTimes(1);}finally{f.first.fill(0);f.second.fill(0);}
});
it('revocation refuses K2 before retrieving K1, and a K1 refusal returns no plaintext',async()=>{
 const f=fixture(),first=vi.fn(async()=>Buffer.from(f.first));try{
  await expect(redeem(f.file,async()=>({isError:true,_meta:{code:'forbidden',cause:'release_refused'}}),first)).rejects.toMatchObject({share:'K2',cause:expect.stringContaining('revoked')});expect(first).not.toHaveBeenCalled();
  await expect(redeem(f.file,async()=>({structuredContent:f.response}),async()=>{throw new ShareRefused('K1','XQ refused HTTP 403');})).rejects.toMatchObject({share:'K1',message:expect.stringContaining('no plaintext was output')});
 }finally{f.first.fill(0);f.second.fill(0);}
});
it('sign-in requests a normal nonce-bound link, consumes it through the normal callback, and writes only a private cookie file',async()=>{
 const root=await mkdtemp(join(tmpdir(),'steps-signin-')),token='MAGIC_LINK_SECRET_SENTINEL',session='opintel_session=SESSION_SECRET_SENTINEL';let nonce='';const calls:string[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:URL,init:RequestInit)=>{const path=input.pathname;calls.push(path);if(path.endsWith('/request-link')){nonce=JSON.parse(String(init.body)).deviceNonce;return new Response(null,{status:202});}if(path.endsWith('/callback')){expect(JSON.parse(String(init.body))).toEqual({token,deviceNonce:nonce});return new Response(JSON.stringify({deviceMismatch:false}),{headers:{'set-cookie':session+'; HttpOnly; Secure; Path=/'}});}return new Response('{}');}));
 try{const printed:string[]=[],out=join(root,'session');await run(['sign-in','--gateway','https://gateway.example','--email','owner@example.test','--session-out',out],line=>printed.push(line),async()=>`https://gateway.example/auth/callback?token=${token}`);expect(calls).toEqual(['/api/v1/auth/request-link','/api/v1/auth/callback','/api/v1/auth/me']);expect(await readFile(out,'utf8')).toBe(session+'\n');expect((await stat(out)).mode&0o777).toBe(0o600);expect(printed.join('\n')).not.toContain(token);expect(printed.join('\n')).not.toContain(session);}finally{await rm(root,{recursive:true,force:true});}
});
it.each(['identity-bound','bearer-only'])('grant-access uses the admin session and writes its key only to the requested private file; kind=%s',async kind=>{
 const root=await mkdtemp(join(tmpdir(),'steps-grant-')),project=randomUUID(),pool=randomUUID(),credential=randomUUID(),key='opk_live_'+'A'.repeat(22),calls:unknown[]=[];
 vi.stubGlobal('fetch',vi.fn(async(input:URL,init:RequestInit)=>{expect((init.headers as Record<string,string>).cookie).toBe('opintel_session=TEST_SESSION');expect(input.pathname).not.toContain('/custody-identities');calls.push(JSON.parse(String(init.body)));return new Response(JSON.stringify({poolId:pool,credentialId:credential,keyVersion:randomUUID(),prefix:'opk_live_A',createdAt:'2026-11-01T00:00:00Z',state:'current',graceUntil:null,keyShown:true,key}));}));
 try{const session=join(root,'session'),out=join(root,'key'),printed:string[]=[];await writeFile(session,'opintel_session=TEST_SESSION',{mode:0o600});await run(['grant-access','--gateway','https://gateway.example','--project',project,'--pool',pool,'--agent','Analyst','--session-file',session,'--key-out',out,'--kind',kind],line=>printed.push(line));expect(calls).toEqual([{projectId:project,label:'Analyst',credentialKind:kind}]);expect(await readFile(out,'utf8')).toBe(key+'\n');expect((await stat(out)).mode&0o777).toBe(0o600);expect(printed.join('\n')).not.toContain(key);expect(printed.join('\n')).not.toContain('TEST_SESSION');}finally{await rm(root,{recursive:true,force:true});}
});

it.each([false,true])('redeem-and-unseal writes private plaintext output, and prints its values only with --show=%s',async show=>{
 const f=fixture(),root=await mkdtemp(join(tmpdir(),'steps-redeem-'));try{
  const result=join(root,'result'),key=join(root,'key'),apiKey=join(root,'xq-key'),out=join(root,'clear'),identity={certificateId:223,deviceName:'device-one',recipientIdentifier:'provider-public-subject'};
  await writeFile(result,JSON.stringify(f.file),{mode:0o600});await writeFile(key,'opk_live_'+'A'.repeat(22),{mode:0o600});await writeFile(apiKey,'PRIVATE_API_SENTINEL',{mode:0o600});await writeFile(join(root,'public-association.json'),JSON.stringify(identity),{mode:0o600});vi.stubEnv('STEPS_XQ_API_KEY_FILE',apiKey);
  mock.call.mockResolvedValue({structuredContent:f.response});mock.device.exchange.mockResolvedValue(identity);mock.device.share.mockImplementation(async()=>Buffer.from(f.first));
  const printed:string[]=[];await run(['redeem-and-unseal','--gateway',f.file.gateway,'--project',f.file.project,'--key-file',key,'--agent-id','agent-one','--result',result,'--xq-identity',root,'--out',out,...show?['--show']:[]],line=>printed.push(line));
  expect(printed.join('\n').includes('custody-original')).toBe(show);expect(printed.join('\n')).toContain('receipt state: redeemed');expect(printed.join('\n')).not.toContain('PRIVATE_API_SENTINEL');expect(printed.join('\n')).not.toContain(f.response.share);expect(printed.join('\n')).not.toContain(f.first.toString('base64url'));expect(JSON.parse(await readFile(out,'utf8')).rows[0][3]).toBe('custody-original');expect((await stat(out)).mode&0o777).toBe(0o600);
 }finally{f.first.fill(0);f.second.fill(0);await rm(root,{recursive:true,force:true});}
});

it('a refused redemption step produces no table, private plaintext file or XQ share fetch',async()=>{
 const f=fixture(),root=await mkdtemp(join(tmpdir(),'steps-refusal-'));try{
  const result=join(root,'result'),key=join(root,'key'),apiKey=join(root,'xq-key'),out=join(root,'must-not-exist'),identity={certificateId:223,deviceName:'device-one',recipientIdentifier:'provider-public-subject'};
  await writeFile(result,JSON.stringify(f.file),{mode:0o600});await writeFile(key,'opk_live_'+'A'.repeat(22),{mode:0o600});await writeFile(apiKey,'PRIVATE_API_SENTINEL',{mode:0o600});await writeFile(join(root,'public-association.json'),JSON.stringify(identity),{mode:0o600});vi.stubEnv('STEPS_XQ_API_KEY_FILE',apiKey);mock.device.exchange.mockResolvedValue(identity);mock.call.mockResolvedValue({isError:true,_meta:{code:'forbidden',cause:'release_refused'}});
  const printed:string[]=[];await expect(run(['redeem-and-unseal','--gateway',f.file.gateway,'--project',f.file.project,'--key-file',key,'--agent-id','agent-one','--result',result,'--xq-identity',root,'--out',out,'--show'],line=>printed.push(line))).rejects.toMatchObject({share:'K2',cause:expect.stringContaining('revoked')});expect(printed).toEqual([]);expect(mock.device.share).not.toHaveBeenCalled();await expect(stat(out)).rejects.toMatchObject({code:'ENOENT'});
 }finally{f.first.fill(0);f.second.fill(0);await rm(root,{recursive:true,force:true});}
});

it('terminal tables escape control characters while the result data remains unchanged',()=>{const result={columns:[{name:'value'}],rows:[['before\u001b[31mafter\nnext']]};expect(table(result)).toContain('before\\u001b[31mafter\\nnext');expect(table(result)).not.toContain('\u001b');expect(result.rows[0]![0]).toContain('\u001b');});

it('diagnostics retain safe status/native causes and never echo opaque codes or error messages',()=>{const secret='opk_live_'+'A'.repeat(22);expect(transportFailure(new TypeError(secret,{cause:Object.assign(new Error(secret),{code:'ENOTFOUND'})}))).toContain('ENOTFOUND');expect(transportFailure(Object.assign(new Error(secret),{code:401}))).toContain('HTTP 401');expect(publicCode(secret)).toBe('not_reported');expect(publicCause(secret)).toBe('not_reported');expect(transportFailure(new Error(secret))).not.toContain(secret);});

it('enrollment returns an XQ-redeemed nonce once during initialize, never replaying a query',async()=>{
 const {withEnrollmentProof}=await vi.importActual<typeof import('../scripts/steps/infrastructure/mcp.js')>('../scripts/steps/infrastructure/mcp.js');
 const nonce=Buffer.alloc(32,7),challenge={id:randomUUID(),locator:'one-time-locator',expiresAt:new Date(Date.now()+120000).toISOString()},enrollment={certificateId:223,deviceName:'Agent label',recipientIdentifier:'xq-recipient'};
 const refusal=()=>new Response(JSON.stringify({error:{details:{cause:'identity_unproven',challenge}}}),{status:401});
 const wire:unknown[]=[],base=vi.fn(async(_input:unknown,init?:RequestInit)=>{wire.push(JSON.parse(String(init?.body)));return wire.length===1?refusal():new Response('{}');}),redeem=vi.fn(async()=>nonce);
 const transport=withEnrollmentProof(base,{certificate:'public-certificate',key:'fixture-key',enrollment,proveEnrollment:redeem});
 const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}};
 expect((await transport('https://gateway.example/mcp',{method:'POST',body:JSON.stringify(initialize)})).status).toBe(200);
 expect(redeem).toHaveBeenCalledExactlyOnceWith(challenge.locator);expect(wire[1]).toMatchObject({params:{_meta:{'opintel.identity':{...enrollment,proof:{id:challenge.id,nonce:Buffer.alloc(32,7).toString('base64url')}}}}});expect(nonce.equals(Buffer.alloc(32))).toBe(true);
 base.mockImplementation(async()=>refusal());base.mockClear();redeem.mockClear();
 expect((await transport('https://gateway.example/mcp',{method:'POST',body:JSON.stringify({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'opintel.query',arguments:{sql:'SELECT 1'}}})})).status).toBe(401);expect(base).toHaveBeenCalledTimes(1);expect(redeem).not.toHaveBeenCalled();
});

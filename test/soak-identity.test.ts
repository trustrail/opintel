import {afterEach,expect,it,vi} from 'vitest';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {demoTables,generateSpecification,soakCredentialKind} from '../scripts/demo-soak-definition.js';

const calls=vi.hoisted(()=>({identity:vi.fn(),connect:vi.fn()}));
vi.mock('../scripts/steps/infrastructure/identity.js',()=>({enrollmentIdentity:calls.identity}));
vi.mock('../scripts/steps/infrastructure/mcp.js',()=>({mcpAgent:calls.connect}));
import {externalTarget,soakAgentTarget} from '../scripts/soak/external.js';

afterEach(()=>vi.clearAllMocks());
it('selects identity-bound for custody pools and bearer-only for pools without custody',()=>{
 expect(soakCredentialKind(0)).toBe('identity-bound');expect(soakCredentialKind(1)).toBe('identity-bound');
 expect(soakCredentialKind(0,[{name:'ordinary',schema:'public',rows:[{name:'value'}]}])).toBe('bearer-only');
});
it('uses the public agent ingress instead of the operator-only TLS listener',()=>{
 expect(soakAgentTarget({OPINTEL_API_BASE_URL:'https://gateway.example',OPINTEL_OPERATOR_API_TARGET:'https://ingress:8444'})).toBe('https://gateway.example');
 expect(()=>soakAgentTarget({OPINTEL_OPERATOR_API_TARGET:'https://ingress:8444'})).toThrow('OPINTEL_API_BASE_URL');
});
it('connects each custody agent with its mapped enrollment identity and challenge handler',async()=>{
 const root=await mkdtemp(join(tmpdir(),'soak-identities-'));
 try{
  const mapping=Array.from({length:4},(_,i)=>({certificateId:100+i,deviceName:`device-${i}`,bundlePath:join(root,`device-${i}`)}));
  const agents=Array.from({length:10},(_,i)=>{const entry=mapping[Math.floor(i/5)*2+i%2]!;return {poolIndex:Math.floor(i/5),pool:randomUUID(),credentialId:randomUUID(),key:`key-${i}`,association:{certificateId:entry.certificateId,deviceName:entry.deviceName,recipientIdentifier:`recipient-${entry.certificateId}`}};});
  const names=Object.fromEntries(demoTables.map(t=>[t.name,`source.public.${t.name}`]));
  const manifest={version:2,projectId:randomUUID(),definitionHash:'fixture',agents,objects:{},specification:generateSpecification(names,agents)};
  const file=join(root,'manifest.json'),mappingFile=join(root,'mapping.json');await writeFile(file,JSON.stringify(manifest),{mode:0o600});await writeFile(mappingFile,JSON.stringify(mapping));
  const proof=vi.fn(async()=>new Uint8Array(32).fill(7));calls.identity.mockImplementation(async(directory,_file,enrollment)=>{const entry=mapping.find(value=>value.bundlePath===directory);expect(entry).toBeDefined();expect(enrollment).toEqual({certificateId:entry!.certificateId,deviceName:entry!.deviceName,recipientIdentifier:`recipient-${entry!.certificateId}`});return {certificate:`cert-${entry!.certificateId}`,key:'key',enrollment,proveEnrollment:proof};});
  const {withEnrollmentProof}=await vi.importActual<typeof import('../scripts/steps/infrastructure/mcp.js')>('../scripts/steps/infrastructure/mcp.js');
  calls.connect.mockImplementation(async(_base,_project,_key,_agent,identity)=>{const challenge={id:randomUUID(),locator:'challenge',expiresAt:new Date(Date.now()+120000).toISOString()};let attempts=0;const base=vi.fn(async(_url,init)=>{attempts++;if(attempts===1)return new Response(JSON.stringify({error:{details:{cause:'identity_unproven',challenge}}}),{status:401});const sent=JSON.parse(String(init.body)).params._meta['opintel.identity'];expect(sent.proof.id).toBe(challenge.id);expect(identity.certificate).toBe(`cert-${sent.certificateId}`);expect(sent.recipientIdentifier).toBe(`recipient-${sent.certificateId}`);return new Response('{}');});const initialize={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'test',version:'1'}}};expect((await withEnrollmentProof(base,identity)('https://gateway.example/mcp',{method:'POST',body:JSON.stringify(initialize)})).status).toBe(200);return {client:{close:async()=>{}}};});
  const target=await externalTarget('https://gateway.example',file,mappingFile);
  for(const [i,agent] of agents.entries())await target.connect(agent.key,`agent-${i}`);
  expect(calls.identity).toHaveBeenCalledTimes(10);expect(proof).toHaveBeenCalledTimes(10);
  expect(new Set(calls.identity.mock.calls.map(call=>call[0])).size).toBe(4);
  for(const [i,agent] of agents.entries())expect(calls.identity.mock.calls[i]?.[2]).toEqual(agent.association);
  await target.close();
 }finally{await rm(root,{recursive:true,force:true});}
});

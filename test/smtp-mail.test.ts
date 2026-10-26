import {SMTPServer} from 'smtp-server';
import {beforeAll,afterAll,it,expect,vi} from 'vitest';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareSidecarDevelopment} from '../scripts/sidecar-dev.js';
import {loadSidecarConfig} from '../sidecar/config.js';
import {SmtpMailAdapter,smtpSettings} from '../src/platform/mail/infrastructure/smtp-adapter.js';
import {SystemClock} from '../src/shared/kernel/index.js';
let directory:string,tls:Awaited<ReturnType<typeof loadSidecarConfig>>['tls'];
beforeAll(async()=>{directory=await mkdtemp(join(tmpdir(),'smtp-test-'));await prepareSidecarDevelopment(directory);tls=(await loadSidecarConfig(join(directory,'service.json'))).tls;},30000);
afterAll(async()=>{await rm(directory,{recursive:true,force:true});});
it.each(['implicit','starttls'] as const)('DEP-015: %s delivers mail over verified TLS without logging authentication material',async tlsMode=>{
 let delivered='',encrypted=false;
 const server=new SMTPServer({secure:tlsMode==='implicit',key:tls.key,cert:tls.cert,authOptional:true,disabledCommands:['AUTH'],onData(stream,session,callback){encrypted=session.secure;stream.on('data',chunk=>{delivered+=String(chunk);});stream.on('end',()=>callback());}});
 server.on('error',()=>{});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const address=server.server.address();if(!address||typeof address==='string')throw new Error();
 const log=vi.spyOn(console,'info').mockImplementation(()=>{});
 try{
  const config={host:'127.0.0.1',port:address.port,user:'',password:'',sender:'sender@example.invalid',tlsMode};
  const adapter=new SmtpMailAdapter(config,new SystemClock(),'https://gateway.example.invalid',tls.ca);
  expect(await adapter.send({to:'person@example.invalid',template:'magic_link',vars:{token:'synthetic-only-token'},idempotencyKey:'synthetic-mail'})).toMatchObject({ok:true});
  expect(encrypted).toBe(true);expect(delivered).toContain('synthetic-only-token');expect(delivered).toContain('/auth/callback');expect(log).not.toHaveBeenCalled();
  const untrusted=new SmtpMailAdapter(config,new SystemClock(),'https://gateway.example.invalid');
  expect(await untrusted.send({to:'person@example.invalid',template:'magic_link',vars:{token:'synthetic-only-token'},idempotencyKey:'untrusted'})).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
 }finally{log.mockRestore();await new Promise<void>(r=>server.close(()=>r()));}
});
it('DEP-015: unset SMTP selects fallback; partial settings fail without exposing values',()=>{
 expect(smtpSettings({})).toBeNull();expect(()=>smtpSettings({SMTP_PASSWORD:'SENTINEL'})).toThrow('Invalid SMTP configuration');
 for(const tlsMode of ['implicit','starttls'])expect(smtpSettings({SMTP_HOST:'smtp.example.invalid',SMTP_PORT:'465',SMTP_USER:'synthetic',SMTP_PASSWORD:'synthetic',SMTP_SENDER:'sender@example.invalid',SMTP_TLS_MODE:tlsMode})?.tlsMode).toBe(tlsMode);
 expect(()=>smtpSettings({SMTP_HOST:'smtp.example.invalid',SMTP_TLS_MODE:'none'})).toThrow('Invalid SMTP configuration');
});

import {afterEach,expect,it,vi} from 'vitest';
import {createServer,type Server} from 'node:http';
import {randomUUID} from 'node:crypto';
const address=vi.hoisted(()=>'/tmp/opintel-egress-client-'+process.pid+'.sock');
vi.mock('../sidecar/egress/infrastructure/control-address.js',()=>({egressControlAddress:address}));
import {registerEgress} from '../sidecar/egress/infrastructure/control-client.js';
const body=()=>({requestId:randomUUID(),projectId:randomUUID(),engineId:randomUUID(),gatewayUrl:'https://gateway.example:3102/'});
let server:Server|undefined;
afterEach(async()=>{server?.closeAllConnections();if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));server=undefined;vi.restoreAllMocks();});
it.each(['status','malformed','socket','timeout'] as const)('registration retains %s without response values or addresses in its diagnostic',async(cause)=>{
 const warning=vi.spyOn(console,'warn').mockImplementation(()=>{});
 const sentinel='PRIVATE_RESPONSE_SENTINEL';
 const originalTimeout=AbortSignal.timeout.bind(AbortSignal);
 if(cause==='timeout')vi.spyOn(AbortSignal,'timeout').mockImplementation(()=>originalTimeout(40));
 server=createServer((req,res)=>{req.resume();if(cause==='timeout')return;if(cause==='socket'){req.socket.destroy();return;}res.writeHead(cause==='status'?503:200,{'connection':'close'});res.end(sentinel);});
 await new Promise<void>(resolve=>server!.listen(address,resolve));
 const result=await registerEgress(body());
 expect(result).toMatchObject({ok:false,error:{code:'dependency_unavailable',details:{registrationCause:cause}}});
 expect(warning).toHaveBeenCalledTimes(1);
 expect(warning.mock.calls[0]?.[0]).toMatchObject({event:'engine.egress_registration_failed',registrationCause:cause});
 expect(JSON.stringify(warning.mock.calls)).not.toContain(sentinel);expect(JSON.stringify(warning.mock.calls)).not.toContain('gateway.example');
});
it('successful registration is unchanged',async()=>{
 server=createServer((req,res)=>{req.resume();res.setHeader('connection','close');res.end(JSON.stringify({registered:true}));});await new Promise<void>(resolve=>server!.listen(address,resolve));
 expect(await registerEgress(body())).toEqual({ok:true,value:{registered:true}});
});

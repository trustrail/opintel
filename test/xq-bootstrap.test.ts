import {afterEach,expect,it,vi} from 'vitest';
import {bootstrap} from '../scripts/xq-bootstrap.js';
import {authorizeSender} from '../scripts/infrastructure/xq-bootstrap-worker.mjs';

const mocks=vi.hoisted(()=>({authorize:vi.fn(),construct:vi.fn(),clear:vi.fn()}));
vi.mock('@xqmsg/jssdk-core',()=>({
 XQSDK:class {VALIDATION_SERVER_URL='https://sdk-endpoint.invalid/from-sdk/';constructor(configuration:unknown){mocks.construct(configuration);}getCache(){return {clearAllProfiles:mocks.clear};}},
 AuthorizeAlias:class {supplyAsync=mocks.authorize;},
 FetchKey:class {serviceName='sdk-key-service';},
 ServerResponse:class {static OK='OK';static ERROR='ERROR';},
}));
afterEach(()=>{vi.clearAllMocks();vi.unstubAllEnvs();});
const token=(claims:unknown)=>`header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
const env='OPINTEL_XQ_API_KEY=mock-api-secret\nOPINTEL_XQ_SENDER_ALIAS=dev-sender\n';
it('authorizes the configured alias through the SDK and prints only final assignments and expiry',async()=>{
 const access=token({exp:2_000_000_000});mocks.authorize.mockResolvedValue({status:'OK',payload:access});
 const log=vi.spyOn(console,'log'),error=vi.spyOn(console,'error');
 try{
  const output=await bootstrap(env,authorizeSender,0);
  expect(mocks.construct).toHaveBeenCalledWith({XQ_API_KEY:'mock-api-secret'});
  expect(mocks.authorize).toHaveBeenCalledExactlyOnceWith({user:'dev-sender'});
  expect(output).toBe(`OPINTEL_XQ_SENDER_ACCESS_TOKEN=${access}\nOPINTEL_XQ_REDEEM_URL=https://sdk-endpoint.invalid/from-sdk/sdk-key-service\n# Sender token expires at 2033-05-18T03:33:20.000Z (JWT exp; signature not verified locally).\n`);
  expect(output).not.toContain('mock-api-secret');expect(log).not.toHaveBeenCalled();expect(error).not.toHaveBeenCalled();expect(mocks.clear).toHaveBeenCalledOnce();
 }finally{log.mockRestore();error.mockRestore();}
});
it('sanitizes SDK errors even when they contain secrets',async()=>{
 mocks.authorize.mockRejectedValue(new Error('mock-api-secret secret-token'));
 await expect(bootstrap(env,authorizeSender,0)).rejects.toThrow(/^XQ bootstrap failed\./);
 try{await bootstrap(env,authorizeSender,0);}catch(e){expect(String(e)).not.toMatch(/mock-api-secret|secret-token/u);}
 expect(mocks.clear).toHaveBeenCalledTimes(2);
});
it.each([{exp:1},{},{exp:'invalid'}])('does not return a token with invalid or expired expiry %j',async claims=>{
 await expect(bootstrap(env,async()=>({token:token(claims),redeemUrl:'https://sdk.invalid/key'}),2000)).rejects.toThrow(/^XQ bootstrap failed\./);
});
it('rejects missing input and production without calling the SDK',async()=>{
 const authorize=vi.fn();await expect(bootstrap('',authorize)).rejects.toThrow(/^XQ bootstrap failed\./);
 vi.stubEnv('NODE_ENV','production');await expect(bootstrap(env,authorize)).rejects.toThrow(/^XQ bootstrap failed\./);expect(authorize).not.toHaveBeenCalled();
});
it('does not emit .env injection from a malformed provider result',async()=>{
 await expect(bootstrap(env,async()=>({token:'secret\nINJECTED=yes',redeemUrl:'https://sdk.invalid/key'}),0)).rejects.toThrow(/^XQ bootstrap failed\./);
 mocks.authorize.mockResolvedValue({status:'ERROR',payload:'provider-secret'});
 await expect(bootstrap(env,authorizeSender,0)).rejects.toThrow(/^XQ bootstrap failed\./);
});

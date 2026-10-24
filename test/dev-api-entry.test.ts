import {afterEach,it,expect,vi} from 'vitest';

afterEach(()=>{vi.doUnmock('dotenv');vi.doUnmock('../src/platform/http/start.js');vi.unstubAllEnvs();vi.resetModules();});
it('loads the development environment before importing the API and skips dotenv in production',async()=>{
 for(const mode of ['development','production']){
  vi.resetModules();vi.stubEnv('NODE_ENV',mode);vi.stubEnv('DATABASE_URL','');
  const order:string[]=[];
  vi.doMock('dotenv',()=>({config:()=>{order.push('dotenv');process.env.DATABASE_URL='postgres://fixture';}}));
  vi.doMock('../src/platform/http/start.js',()=>{
   order.push('api');expect(process.env.DATABASE_URL).toBe(mode==='development'?'postgres://fixture':'');return {};
  });
  await import('../scripts/dev-api.js');
  expect(order).toEqual(mode==='development'?['dotenv','api']:['api']);
 }
});

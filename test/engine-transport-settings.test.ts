import {ProjectId} from '../src/shared/kernel/value-objects.js';
import {afterEach,describe,expect,it} from 'vitest';
import {engineTransportDefaults,engineTransportSettingDefinitions,engineTransportSettingsFromEnv} from '../src/shared/engine-transport-settings.js';
import {clearEngineTransportMetrics,engineTransportLatency,recordEngineTransport} from '../src/shared/infrastructure/engine-transport-metrics.js';
import {EngineTransportLatency} from '../src/shared/engine-transport-telemetry.js';
import {custodyOperations} from '../src/shared/custody-contract.js';
describe('install-time engine transport settings',()=>{
 it('uses the approved six defaults',()=>expect(engineTransportDefaults).toEqual({maxSessions:1,maxConcurrentStreams:32,idleTimeoutMs:60000,maxSessionAgeMs:600000,connectTimeoutMs:5000,pingIntervalMs:15000}));
 for(const [name,definition] of Object.entries(engineTransportSettingDefinitions)){
  it(`${name} validates its boundaries and names an invalid setting without its value`,()=>{
   for(const value of [definition.min,definition.max])expect(engineTransportSettingsFromEnv({[definition.env]:String(value)})).toHaveProperty(name,value);
   for(const value of ['secret-value','',String(definition.min-1),String(definition.max+1),'1.5']){
    expect(()=>engineTransportSettingsFromEnv({[definition.env]:value})).toThrow(`Invalid ${definition.env}: use an integer from ${definition.min} to ${definition.max}.`);
   }
  });
 }
});
afterEach(clearEngineTransportMetrics);
it('per-path summaries use bounded samples and never expose addresses, pins or unknown paths',()=>{
 const address='https://private-engine.invalid:3100',pin='secret-pin';
 for(let value=1;value<=1100;value++)recordEngineTransport(address,pin,'/execute',value,value===1100);
 recordEngineTransport(address,pin,'/unexpected-private-path',2,false);
 const summary=EngineTransportLatency.parse(engineTransportLatency(address,pin)),query=summary.paths.find(p=>p.path==='/execute');
 expect(query).toMatchObject({count:1100,failed:1,p50Ms:588,p95Ms:1049,lastMs:1100});
 expect(JSON.stringify(summary)).not.toMatch(/private-engine|secret-pin|unexpected-private/);
 expect(engineTransportLatency(address,'different-pin')).toBeNull();
});
it('every custody operation has a bounded telemetry path',()=>{
 for(const path of Object.keys(custodyOperations)){
  recordEngineTransport('https://engine.invalid','pin','/custody/'+path,1,false);
 }
 expect(engineTransportLatency('https://engine.invalid','pin')?.paths.every(p=>p.path!=='/other')).toBe(true);
});

it('engine telemetry stays project-scoped even when projects share a pinned engine',()=>{
 const a=ProjectId('00000000-0000-4000-8000-000000000001'),b=ProjectId('00000000-0000-4000-8000-000000000002'),address='https://engine.invalid',pin='same-pin';
 recordEngineTransport(address,pin,'/execute',10,false,a);recordEngineTransport(address,pin,'/execute',100,true,b);
 expect(engineTransportLatency(address,pin,a)?.paths).toMatchObject([{count:1,failed:0,p50Ms:10}]);
 expect(engineTransportLatency(address,pin,b)?.paths).toMatchObject([{count:1,failed:1,p50Ms:100}]);expect(engineTransportLatency(address,pin)).toBeNull();
});

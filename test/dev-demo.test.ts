import {describe,it,expect} from 'vitest';
import {assertDevelopmentDemo,demoTreatment,retainDemoLandingZone} from '../scripts/dev-demo-policy.js';
import {ProjectId,SourceId} from '../src/shared/kernel/index.js';

describe('development demo bootstrap safeguards',()=>{
 it('retires volume-wipe references while retaining other projects and prepared reservations',()=>{
  const demo=ProjectId('de000000-0000-4000-8000-000000000001'),other=ProjectId('de000000-0000-4000-8000-000000000002');
  const source=SourceId('de000000-0000-4000-8000-000000000003'),old=SourceId('de000000-0000-4000-8000-000000000004');
  const projects=new Set([demo,other]);
  expect(retainDemoLandingZone({projectId:demo,sourceId:source},projects,demo,source)).toBe(true);
  expect(retainDemoLandingZone({projectId:demo,sourceId:old},projects,demo,source)).toBe(false);
  expect(retainDemoLandingZone({projectId:demo,sourceId:source},projects,demo,null)).toBe(false);
  expect(retainDemoLandingZone({projectId:other,sourceId:old},projects,demo,null)).toBe(true);
  expect(retainDemoLandingZone({projectId:other,sourceId:old},new Set([demo]),demo,null)).toBe(false);
 });
 it('accepts only development and loopback services',()=>{
  expect(()=>assertDevelopmentDemo({NODE_ENV:'development',DATABASE_URL:'postgres://app@127.0.0.1/demo',SPICEDB_ENDPOINT:'localhost:50051'})).not.toThrow();
  for(const NODE_ENV of ['production','staging','test'])expect(()=>assertDevelopmentDemo({NODE_ENV})).toThrow('development only');
  for(const key of ['DATABASE_URL','MIGRATION_DATABASE_URL','TEST_DATABASE_URL','REDIS_URL','APP_BASE_URL'])expect(()=>assertDevelopmentDemo({[key]:'https://example.com/db'})).toThrow('loopback');
  expect(()=>assertDevelopmentDemo({SPICEDB_ENDPOINT:'example.com:50051'})).toThrow('loopback');
  for(const key of ['SIDECAR_CONFIG_FILE','SIDECAR_CLIENT_CONFIG'])expect(()=>assertDevelopmentDemo({[key]:'/elsewhere/config.json'})).toThrow('tmp/sidecar');
 });
 it('covers all five decisions on landed demo columns, without tokenizing provenance',()=>{
  const column=(sourceIdentifier:string,exposedType:string,ordinal=1)=>({sourceIdentifier,exposedType,ordinal});
  expect(demoTreatment(column('treaty_ref','VARCHAR'),0)).toBe('tokenized');
  expect(demoTreatment(column('Treaty Ref','VARCHAR'),2)).toBe('tokenized');
  expect(demoTreatment(column('currency','VARCHAR',4),1)).toBe('masked');
  expect(demoTreatment(column('currency','VARCHAR',4),3)).toBe('withheld');
  expect(demoTreatment(column('written_premium','DECIMAL(38,10)',2),0)).toBe('aggregate_only');
  expect(demoTreatment(column('Inception Date','DATE',3),0)).toBe('aggregate_only');
  expect(demoTreatment({sourceIdentifier:'Written Premium',exposedType:null,ordinal:2},0)).toBe('withheld');
  expect(demoTreatment(column('_filing_id','VARCHAR',5),0)).toBe('clear');
 });
});

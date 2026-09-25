import { randomUUID } from 'node:crypto';
import { describe, it, expect, vi } from 'vitest';
import { Entitlement, TreatmentStrategies, type Treatment, type MaskKind, type TokenizerPort } from '../src/modules/entitlements/index.js';
import type { ExposedType } from '../src/modules/catalog/index.js';
import { DomainError, ElementId, ProjectId, PoolId, UserId, Timestamp, ok, err, type Result } from '../src/shared/kernel/index.js';
const unwrap=<T>(r:Result<T>):T=>{if(!r.ok)throw new Error(r.error.message);return r.value;};
const element=ElementId(randomUUID()),project=ProjectId(randomUUID()),pool=PoolId(randomUUID()),user=UserId(randomUUID());
const at=Timestamp(new Date('2026-09-21T10:00:00.000Z'));
const decision=(treatment:Treatment,maskKind:MaskKind|null=null,id=element)=>unwrap(Entitlement.decide({poolId:pool,projectId:project,elementId:id,treatment,maskKind,setBy:{kind:'user',id:user},setAt:at,justification:null}));
describe('4.2 treatment strategies',()=>{
 it('H-002: clear preserves values, type, nulls and decision provenance',async()=>{
  const entitlement=decision('clear');
  const strategy=unwrap(new TreatmentStrategies().resolve({id:element,type:'DECIMAL(20,4)'},entitlement));
  expect(strategy.kind).toBe('clear');if(strategy.kind!=='clear')throw new Error();
  for(const value of [null,'1234567890123456.1234',123n,{nested:['value']}])expect(unwrap(await strategy.apply(value))).toBe(value);
  expect(strategy.outputType).toBe('DECIMAL(20,4)');expect(entitlement.state).toMatchObject({setBy:{kind:'user',id:user},setAt:at});
 });
 it('H-003/H-004: withheld and absent decisions are distinct omissions with no value evaluator',()=>{
  const strategies=new TreatmentStrategies();
  expect(unwrap(strategies.resolve({id:element,type:'VARCHAR'},decision('withheld')))).toEqual({kind:'omitted',reason:'withheld',outputType:null});
  expect(unwrap(strategies.resolve({id:element,type:'VARCHAR'},null))).toEqual({kind:'omitted',reason:'undecided',outputType:null});
  expect(unwrap(strategies.resolve({id:element,type:null},decision('clear')))).toEqual({kind:'omitted',reason:'unsupported',outputType:null});
 });
 it('H-005/H-006: tokenized delegates unchanged values and identifiers to the port, including another source element',async()=>{
  const tokenize=vi.fn<TokenizerPort['tokenize']>().mockResolvedValue(ok('port-produced-token'));
  const strategies=new TreatmentStrategies({tokenize});
  const other=ElementId(randomUUID());
  for(const id of [element,other]){
   const strategy=unwrap(strategies.resolve({id,type:'BIGINT'},decision('tokenized',null,id)));
   expect(strategy.outputType).toBe('VARCHAR');if(strategy.kind!=='tokenized')throw new Error();
   const value=9007199254740993n;
   expect(await strategy.apply(value)).toEqual(ok('port-produced-token'));
   expect(tokenize).toHaveBeenLastCalledWith({projectId:project,elementId:id,value});
  }
  expect(tokenize).toHaveBeenCalledTimes(2);
 });
 it('tokenizer absence or refusal never falls back to clear',async()=>{
  expect(new TreatmentStrategies().resolve({id:element,type:'INTEGER'},decision('tokenized'))).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
  const failure=new DomainError('dependency_unavailable','Token key unavailable.');
  const strategy=unwrap(new TreatmentStrategies({tokenize:async()=>err(failure)}).resolve({id:element,type:'INTEGER'},decision('tokenized')));
  if(strategy.kind!=='tokenized')throw new Error();expect(await strategy.apply(42)).toEqual(err(failure));
 });
 it('H-008: aggregate_only preserves the column type and requires query inspection; it cannot apply a raw value',()=>{
  expect(unwrap(new TreatmentStrategies().resolve({id:element,type:'DOUBLE'},decision('aggregate_only')))).toEqual({kind:'aggregate_only',outputType:'DOUBLE',constraint:{kind:'aggregate_only',elementId:element}});
 });
 it.each([
  ['last4','VARCHAR','12345678','••••5678'],['last4','VARCHAR','1234','****'],['last4','VARCHAR','1','****'],['last4','VARCHAR','','****'],
  ['last4','VARCHAR','😀😀😀😀','****'],['last4','VARCHAR','x😀😀😀😀','••••😀😀😀😀'],['last4','VARCHAR',42,'****'],
  ['email','VARCHAR','someone@example.com','•••@example.com'],['email','VARCHAR','not-an-email','****'],
  ['email','VARCHAR','@example.com','****'],['email','VARCHAR','name@','****'],['email','VARCHAR','name@@example.com','****'],
  ['email','VARCHAR','name@invalid domain','****'],['email','VARCHAR',{secret:'never stringify'},'****'],
  ['all','INTEGER',123,'****'],['all','VARCHAR','a very long secret','****'],['all','JSON',{secret:'hidden'},'****'],
  ['year','DATE','1978-12-31','1978'],['year','TIMESTAMP','1978-12-31 23:59:59','1978'],
  ['year','TIMESTAMPTZ','1978-12-31T23:59:59-05:00','1978'],['year','DATE','2000-02-29','2000'],
  ['year','DATE','1900-02-29','****'],['year','DATE','1978-13-01','****'],['year','DATE','31/12/1978','****'],
  ['year','TIMESTAMP','1978-12-31 25:00:00','****'],['year','DATE',new Date('invalid'),'****'],
  ['year','TIMESTAMPTZ',new Date('2001-01-01T01:00:00Z'),'2001'],
 ] as const)('H-007: %s on %s masks safely (%#)',async(kind,type,value,expected)=>{
  const strategy=unwrap(new TreatmentStrategies().resolve({id:element,type:type as ExposedType},decision('masked',kind)));
  if(strategy.kind!=='masked')throw new Error();expect(strategy.outputType).toBe('VARCHAR');
  expect(unwrap(await strategy.apply(value))).toBe(expected);expect(unwrap(await strategy.apply(null))).toBeNull();
 });
 it.each([['last4','INTEGER'],['email','UUID'],['year','VARCHAR'],['year','TIME']] as const)('refuses incompatible %s on %s before evaluation', (kind,type)=>{
  expect(new TreatmentStrategies().resolve({id:element,type},decision('masked',kind))).toMatchObject({ok:false,error:{code:'validation_failed'}});
 });
});

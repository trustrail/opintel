import {describe,it,expect} from 'vitest';
import {nextEnabled,nextHref,nextSearchSchema,naturalParent,readNextSearch,isDraftSaveResult} from '../src/app/next/state.js';
import {legacyDestination} from '../src/app/next/navigation.js';
import {controlValueError,normalizeControlValue} from '../src/app/entitlements/typed-value.js';
const project='11111111-1111-4111-8111-111111111111',pool='22222222-2222-4222-8222-222222222222',object='33333333-3333-4333-8333-333333333333';
describe('/next isolation and navigation',()=>{
 it('requires the explicit true flag',()=>{for(const v of [undefined,false,'false','1','TRUE',''])expect(nextEnabled(v)).toBe(false);expect(nextEnabled('true')).toBe(true);});
 it('round-trips shareable scope and scroll, excluding draft values',()=>{const url=new URL(nextHref(project,'decisions',{pool,object,view:'rows',scroll:512}),'http://localhost');expect(nextSearchSchema.parse(Object.fromEntries(url.searchParams))).toEqual({pool,object,view:'rows',scroll:512});expect(nextSearchSchema.parse({draft:'sensitive',secret:'hidden'})).toEqual({});});
 it('preserves historical contributor scope',()=>{const url=new URL(`http://localhost/projects/${project}/entitlements?poolId=${pool}&rowObjectId=${object}&rowDecisionId=${object}`);expect(legacyDestination(url,project)).toMatchObject({destination:'decisions',search:{pool,object,decisionId:object,view:'rows'}});});
 it('does not absorb another project or external route',()=>{expect(legacyDestination(new URL('http://localhost/settings'),project)).toBeNull();expect(legacyDestination(new URL(`http://localhost/projects/${pool}/pools`),project)).toBeNull();});
});
describe('catalogue typed input preconditions',()=>{
 it.each([['9223372036854775807','BIGINT'],['2026-10-14','DATE'],['true','BOOLEAN'],['12:30','TIME'],['2026-10-14T12:30','TIMESTAMPTZ'],['0.001','DECIMAL(5,3)']])('accepts %s for %s without losing precision',(value,type)=>{expect(controlValueError(value,type)).toBeNull();});
 it.each([['9223372036854775808','BIGINT'],['2026-02-30','DATE'],['yes','BOOLEAN'],['12:99','TIME'],['0.0001','DECIMAL(5,3)'],['not-a-uuid','UUID']])('refuses invalid %s for %s before save',(value,type)=>{expect(controlValueError(value,type)).not.toBeNull();});
 it('makes the timezone explicit and retains microseconds',()=>{expect(normalizeControlValue('2026-10-14T12:30:00.123456','TIMESTAMPTZ')).toBe('2026-10-14T12:30:00.123456Z');});
});

it('uses contextual parents for a cold agent or historical decision link',()=>{expect(naturalParent('pools',{pool,agent:'self-declared',panel:'agent'})).toEqual({pool,panel:'pool',poolCursor:undefined});expect(naturalParent('decisions',{pool,object,decisionId:object,view:'rows'})).toEqual({pool,object,view:'rows',decisionId:undefined});});

it.each(['123','true','null','"quoted"'])('preserves JSON-like text %s in a cold link',prefix=>{const url=new URL(nextHref(project,'activity',{prefix,cursor:'50'}),'http://localhost');expect(readNextSearch(url.search)).toEqual({prefix,cursor:'50'});});

it('does not treat preview or selection completion as a saved draft',()=>{expect(isDraftSaveResult({total:20,entitled:5,rows:[],receiptId:object})).toBe(false);expect(isDraftSaveResult(undefined)).toBe(false);expect(isDraftSaveResult({expression:'active = TRUE',hash:'a'.repeat(64)})).toBe(true);});

import {describe,it,expect} from 'vitest';
import {parsePredicate,predicateHash,evaluatePredicate,hasScope} from '../src/shared/row-predicate.js';
import type {PredicateColumn} from '../src/shared/row-scope-contract.js';
const columns:PredicateColumn[]=[{id:'00000000-0000-4000-8000-000000000001',name:'status',sourceIdentifier:'status',type:'VARCHAR'},{id:'00000000-0000-4000-8000-000000000002',name:'amount',sourceIdentifier:'amount',type:'DECIMAL(38,9)'},{id:'00000000-0000-4000-8000-000000000003',name:'at',sourceIdentifier:'at',type:'TIMESTAMPTZ'}];
const parse=(text:string)=>{const r=parsePredicate(text,columns);if(!r.ok)throw r.error;return r.value;};
describe('ROW-001 static predicate grammar and comparison contract',()=>{
 it('normalises whitespace, conjunction order and IN set order',()=>{expect(predicateHash(parse("status IN ('A','B') AND amount >= 1.0"))).toBe(predicateHash(parse(" amount>=1 AND status IN ('B', 'A') ")));});
 it('uses three-valued NULL logic',()=>{const row={[columns[0]!.id]:null};expect(evaluatePredicate(parse("NOT (status = 'closed')"),columns,row)).toBeNull();expect(evaluatePredicate(parse("status IS NULL OR status = 'closed'"),columns,row)).toBe(true);expect(evaluatePredicate(parse("status IS NOT NULL AND status <> 'closed'"),columns,row)).toBe(false);});
 it('compares large decimals without double rounding',()=>{expect(evaluatePredicate(parse('amount = 99999999999999999999999999999.123456789'),columns,{[columns[1]!.id]:'99999999999999999999999999999.123456788'})).toBe(false);});
 it('compares zoned timestamps as instants',()=>{expect(evaluatePredicate(parse("at = '2026-01-01T01:00:00.123456+01:00'"),columns,{[columns[2]!.id]:'2026-01-01 00:00:00.123456+00'})).toBe(true);});
 it.each(["status = amount","lower(status) = 'a'","status = 'a'; DROP TABLE x",'amount = 999999999999999999999999999999','amount = 0.0000000001',"amount = '1'",'status = 1',"at = '2026-01-01T00:00:00'","status LIKE 'A%'",'status IN ()'])('refuses %s',text=>{expect(parsePredicate(text,columns).ok).toBe(false);});
 it('reserves scope references as AST terms',()=>{expect(hasScope(parse('status IN scope(customer)'))).toBe(true);});
});

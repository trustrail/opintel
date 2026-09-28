import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {DomainError,type ErrorCode} from '../src/shared/kernel/index.js';
import {queryResponse,refusalResponse} from '../src/modules/mcp/index.js';
const spec=readFileSync('docs/5-8-model-text.md','utf8');
const review=readFileSync('docs/review/5-8-code-causes.md','utf8');
const catalogue=new Map(review.split('## Exact message catalogue')[1]!.split('## Proposed mapping')[0]!.split('\n').filter(l=>l.startsWith('| ')&&l.includes('| `')).map(l=>{const c=l.split('|').map(s=>s.trim());return [c[1]!,c[2]!.slice(1,-1)];}));
const cases=review.split('## Proposed mapping')[1]!.split('### Fallback coverage')[0]!.split('\n').filter(l=>l.startsWith('| `')).map(l=>l.split('|').map(s=>s.trim().replaceAll('`','')));
const base={columns:[{name:'answer',type:'INTEGER'}],rows:[[42]],truncated:false,evidenceId:'record-1'};
const empty={withheld:[],tokenized:[],masked:[],aggregate_only:[]};
describe('5.8 reviewed exact refusal contract',()=>{
 it.each(cases)('%s %s %s',(_empty,code,cause,_condition,label,retryable)=>{
  const sentence=catalogue.get(label!)!;expect(spec).toContain(sentence);
  const response=refusalResponse(new DomainError(code as ErrorCode,'INTERNAL threshold 938173',{cause:cause!,name:'amount',operation:'ORDER BY',construct:'ATTACH',aggregateMinGroupSize:938173,evidenceId:'record-1',nested:{threshold:938173}},true));
  expect(response.content).toEqual([{type:'text',text:sentence.replaceAll('{name}','amount').replaceAll('{operation}','ORDER BY').replaceAll('{construct}','ATTACH')}]);
  expect(response._meta).toMatchObject({code,cause,evidenceId:'record-1',retryable:retryable==='inherit'||retryable==='true'});
  expect(JSON.stringify(response)).not.toMatch(/938173|threshold|aggregateMinGroupSize|INTERNAL/u);
 });
 it('keeps every resolver state distinct, even from a pre-cause producer',()=>{
  for(const reason of ['all_withheld','all_undecided','mixed_withheld_undecided']){
   const response=refusalResponse(new DomainError('object_unavailable','Object unavailable.',{reason,object:{catalog:'a',schema:'b',name:'c'}}));
   expect(response._meta).toMatchObject({cause:reason,reason,object:{catalog:'a',schema:'b',name:'c'}});
  }
 });
 it('retains validated known distinctions while stripping diagnostics and nested threshold data',()=>{
  const response=refusalResponse(new DomainError('unsupported_on_aggregate_only','threshold 938173',{cause:'cardinality_count_invalid',name:'amount',stage:2,proofCategory:'aggregate_stage2',aggregateMinGroupSize:938173,counts:[938173],treatmentEvidence:{aggregateMinGroupSize:938173},stack:'938173'},true));
  expect(response._meta).toMatchObject({cause:'cardinality_count_invalid',stage:2,proofCategory:'aggregate_stage2',name:'amount',retryable:false});
  expect(JSON.stringify(response)).not.toContain('938173');
 });
 it('does not guess unknown causes, or erase known ones when a rendering input is absent',()=>{
  expect(refusalResponse(new DomainError('dependency_unavailable','private',{cause:'new_cause'},true))).toMatchObject({_meta:{cause:'unclassified',retryable:false},content:[{text:catalogue.get('Unknown')}]});
  expect(refusalResponse(new DomainError('element_withheld','private',{cause:'withheld'},true))).toMatchObject({_meta:{cause:'withheld',retryable:false},content:[{text:catalogue.get('Unknown')}]});
 });
 it('every operator message, including missing-input fallbacks, overrides retryable:true',()=>{
  for(const row of cases)for(const includeInputs of [true,false]){
   const response=refusalResponse(new DomainError(row[1] as ErrorCode,'private',{cause:row[2]!,...(includeInputs?{name:'amount',operation:'ORDER BY',construct:'ATTACH'}:{})},true));
   if(response.content[0]!.text.includes('operator'))expect(response._meta.retryable).toBe(false);
  }
 });
});
describe('I-009 exact success fragments',()=>{
 it.each([
  [[],false,'No rows.'], [[[1]],false,'1 row.'], [[[1],[2]],false,'2 rows.'], [[[1]],true,'1 row. The result was truncated at 1 rows; there are more.'],
 ] as const)('row count and truncation %#',(rows,truncated,text)=>{expect(queryResponse({...base,rows:rows.map(r=>[...r]),truncated}).content).toEqual([{type:'text',text}]);});
 it('uses ordinal order, all reduction kinds and token advice exactly once',()=>{
  const response=queryResponse({...base,rows:Array.from({length:38},()=>[42]),reduction:{withheld:['tax_id','bank_account','salary_band'],tokenized:['email'],masked:['phone'],aggregate_only:['amount']}});
  expect(response.content).toEqual([{type:'text',text:'38 rows. 3 elements were withheld: tax_id, bank_account, salary_band. email was returned tokenized. phone was returned masked. amount can only be read in aggregate. Tokens are stable: the same value is always the same token, so they can be grouped and joined, but not ordered or compared.'}]);
  expect(response._meta).toMatchObject({recordId:'record-1',reduced:true});
 });
 it('singular withholding and plural treated fields',()=>{
  expect(queryResponse({...base,reduction:{...empty,withheld:['tax_id'],tokenized:['email','customer'],masked:['phone','address']}}).content[0]!.text).toBe('1 row. 1 element was withheld: tax_id. email, customer were returned tokenized. phone, address were returned masked. Tokens are stable: the same value is always the same token, so they can be grouped and joined, but not ordered or compared.');
 });
 it('does not redact legitimate result values that happen to equal a configured threshold',()=>{
  expect(queryResponse({...base,rows:[[938173]]}).structuredContent.rows).toEqual([[938173]]);
 });
});

import type {Predicate,PredicateColumn} from '../../../src/shared/row-scope-contract.js';
import {family} from '../../../src/shared/row-predicate.js';
import {DomainError} from '../../../src/shared/kernel/index.js';
const quote=(v:string)=>'"'+v.replaceAll('"','""')+'"';
const literal=(v:string|null)=>v===null?'NULL':"E'"+v.replaceAll("\\","\\\\").replaceAll("'","''")+"'";
/** Text output preserves bpchar padding; ::text would silently trim it. */
export function postgresPredicateInput(c:PredicateColumn):string{
 const name=quote(c.sourceIdentifier),f=family(c.type);
 return f==='text'?`(CASE WHEN ${name} IS NULL THEN NULL ELSE pg_catalog.format('%s',${name}) END)`:name+(f==='number'?'::numeric':'')+'::text';
}
/** Only this closed AST translator emits source row-scope SQL. */
export function postgresRowPredicate(p:Predicate,columns:readonly PredicateColumn[]):string{
 if(p.kind==='and'||p.kind==='or')return '('+p.terms.map(t=>postgresRowPredicate(t,columns)).join(p.kind==='and'?' AND ':' OR ')+')';
 if(p.kind==='not')return '(NOT '+postgresRowPredicate(p.term,columns)+')';
 if(p.kind==='scope')throw new DomainError('validation_failed','scope references arrive in step 3');
 const c=columns.find(c=>c.id===p.column);if(!c)throw new DomainError('validation_failed','The row predicate refers to an unavailable column.');
 const f=family(c.type);if(f==='unsupported')throw new DomainError('validation_failed','The predicate type has no Postgres translator.');
 const name=f==='text'?'('+postgresPredicateInput(c)+' COLLATE "C")':f==='number'?'('+quote(c.sourceIdentifier)+'::numeric)':quote(c.sourceIdentifier);
 const typed=(v:string|null)=>literal(v)+(v===null?'':f==='text'?'::text COLLATE "C"':f==='float'?c.type==='FLOAT'?'::real':'::double precision':f==='number'?'::numeric':f==='uuid'?'::uuid':f==='boolean'?'::boolean':'::'+c.type.toLowerCase());
 return p.kind==='null'?`(${name} IS ${p.negated?'NOT ':''}NULL)`:p.kind==='in'?`(${name} IN (${p.values.map(typed).join(',')}))`:`(${name} ${p.operator} ${typed(p.value)})`;
}

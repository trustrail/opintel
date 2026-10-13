import {createHash} from 'node:crypto';
import {ExactDecimal as Decimal} from './infrastructure/decimal.js';
import {DomainError} from './kernel/index.js';
import type {Predicate,PredicateColumn} from './row-scope-contract.js';
import {normalise,family,floating,temporal} from './row-predicate-syntax.js';
export {parsePredicate,typedLiteral,normalise,family,referencedColumns,hasScope} from './row-predicate-syntax.js';
type Truth=true|false|null;
export function predicateHash(p:Predicate){return createHash('sha256').update(JSON.stringify(normalise(p))).digest('hex');}
function compare(raw:unknown,literal:string,column:PredicateColumn):number{
 const f=family(column.type);if(raw===undefined)throw new DomainError('validation_failed','A row-scope input is missing. No rows were released.');
 if((f==='number'||f==='float')&&String(raw)==='NaN')return 1;
 if((f==='float'||f==='time')&&/^[+-]?infinity$/iu.test(String(raw)))return String(raw).startsWith('-')?-1:1;
 if(f==='number')return new Decimal(String(raw)).cmp(literal);
 if(f==='float')return new Decimal(floating(String(raw),column.type)).cmp(literal);
 if(f==='time'){let text=raw instanceof Date?raw.toISOString():String(raw).replace(' ','T');if(column.type==='TIMESTAMPTZ')text=text.replace(/([+-]\d{2})$/u,'$1:00');return new Decimal(temporal(text,column.type)).cmp(temporal(literal,column.type));}
 if(f==='boolean'){if(![true,false,'true','false','t','f'].includes(raw as string|boolean))throw new DomainError('validation_failed','A row-scope boolean is invalid.');return (raw===true||raw==='true'||raw==='t'?1:0)-(literal==='true'?1:0);}
 const a=Buffer.from(String(raw)),b=Buffer.from(literal);return Buffer.compare(a,b);
}
export function evaluatePredicate(p:Predicate,columns:readonly PredicateColumn[],values:Readonly<Record<string,unknown>>):Truth{
 if(p.kind==='and'||p.kind==='or'){const results=p.terms.map(t=>evaluatePredicate(t,columns,values));return p.kind==='and'?(results.includes(false)?false:results.includes(null)?null:true):(results.includes(true)?true:results.includes(null)?null:false);}
 if(p.kind==='not'){const value=evaluatePredicate(p.term,columns,values);return value===null?null:!value;}
 if(p.kind==='scope')throw new DomainError('validation_failed','scope references arrive in step 3');
 const c=columns.find(c=>c.id===p.column);if(!c)throw new DomainError('validation_failed','The row predicate refers to an unavailable column.');
 const raw=values[c.id];if(raw===undefined)throw new DomainError('validation_failed','A row-scope input is missing.');
 if(p.kind==='null')return p.negated?raw!==null:raw===null;
 if(raw===null)return null;
 if(p.kind==='in'){let unknown=false;for(const v of p.values){if(v===null)unknown=true;else if(compare(raw,v,c)===0)return true;}return unknown?null:false;}
 if(p.value===null)return null;const n=compare(raw,p.value,c);return p.operator==='='?n===0:p.operator==='<>'?n!==0:p.operator==='<'?n<0:p.operator==='<='?n<=0:p.operator==='>'?n>0:n>=0;
}

import {family} from './row-predicate-syntax.js';
import type {Predicate,PredicateColumn} from './row-scope-contract.js';
/** Administrator-facing words over the same AST as the builder; never receipt text. */
export function predicateWords(p:Predicate,columns:readonly PredicateColumn[]):string {
 if(p.kind==='and'||p.kind==='or')return '('+p.terms.map(t=>predicateWords(t,columns)).join(p.kind==='and'?' AND ':' OR ')+')';
 if(p.kind==='not')return 'NOT ('+predicateWords(p.term,columns)+')';
 const column=columns.find(c=>c.id===p.column),name=column?.name??'Unavailable column';
 const value=(v:string|null)=>v===null?'NULL':column&&['number','float','boolean'].includes(family(column.type))?v:JSON.stringify(v);
 if(p.kind==='null')return name+(p.negated?' is not null':' is null');
 if(p.kind==='in')return name+' is one of ('+p.values.map(value).join(', ')+')';
 if(p.kind==='scope')return name+" is in the agent’s "+p.domain;
 const words={'=':'equals','<>':'does not equal','<':'is less than','<=':'is at most','>':'is greater than','>=':'is at least'};
 return name+' '+words[p.operator]+' '+value(p.value);
}

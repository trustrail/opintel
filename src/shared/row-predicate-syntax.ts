import {ExactDecimal as Decimal} from './infrastructure/decimal.js';
import {DomainError} from './kernel/errors.js';
import {err,ok,type Result} from './kernel/result.js';
import {predicate as predicateSchema,type Predicate,type PredicateColumn} from './row-scope-contract.js';
const fail=(message:string):never=>{throw new DomainError('validation_failed',message);};
const decimal=/^DECIMAL\((\d+),(\d+)\)$/u;
const integers:Record<string,[string,string]>={TINYINT:['-128','127'],SMALLINT:['-32768','32767'],INTEGER:['-2147483648','2147483647'],BIGINT:['-9223372036854775808','9223372036854775807'],HUGEINT:['-170141183460469231731687303715884105728','170141183460469231731687303715884105727']};
export function family(type:string){return type in integers||decimal.test(type)?'number':type==='FLOAT'||type==='DOUBLE'?'float':type==='VARCHAR'?'text':type==='UUID'?'uuid':type==='BOOLEAN'?'boolean':['DATE','TIME','TIMESTAMP','TIMESTAMPTZ'].includes(type)?'time':'unsupported';}
/** Recover the exact IEEE value, rather than comparing rounded decimal renderings. */
export function floating(value:string,type:string):string{
 const n=type==='FLOAT'?Math.fround(Number(value)):Number(value);
 if(!Number.isFinite(n))return fail('Floating-point literals must be finite and fit the column type.');
 if(n===0)return '0';
 const bytes=new DataView(new ArrayBuffer(8));bytes.setFloat64(0,n);
 const bits=bytes.getBigUint64(0),exponent=Number((bits>>52n)&2047n),fraction=bits&((1n<<52n)-1n);
 const mantissa=exponent===0?fraction:fraction+(1n<<52n);
 return new Decimal(mantissa.toString()).mul(new Decimal(2).pow((exponent===0?-1022:exponent-1023)-52)).mul(n<0?-1:1).toString();
}
export function temporal(value:string,type:string):string{
 const date='(\\d{4})-(\\d{2})-(\\d{2})',time='(\\d{2}):(\\d{2}):(\\d{2})(?:\\.(\\d{1,6}))?';
 const expression=type==='DATE'?`^${date}$`:type==='TIME'?`^${time}$`:`^${date}T${time}${type==='TIMESTAMPTZ'?'(Z|[+-]\\d{2}:\\d{2})':''}$`;
 const match=new RegExp(expression,'u').exec(value);if(!match)return fail(`Use an ISO 8601 ${type} literal${type==='TIMESTAMPTZ'?' with an explicit zone':''}.`);
 const isTime=type==='TIME',year=isTime?2000:Number(match[1]),month=isTime?1:Number(match[2]),day=isTime?1:Number(match[3]);
 const offset=isTime?0:3,h=type==='DATE'?0:Number(match[offset+1]),m=type==='DATE'?0:Number(match[offset+2]),s=type==='DATE'?0:Number(match[offset+3]);
 const dayDate=new Date(0);dayDate.setUTCFullYear(year,month-1,day);dayDate.setUTCHours(h,m,s,0);
 if(year<1||dayDate.getUTCFullYear()!==year||dayDate.getUTCMonth()!==month-1||dayDate.getUTCDate()!==day||h>23||m>59||s>59)return fail('The ISO 8601 literal is not a valid date or time.');
 const fraction=(type==='DATE'?'':match[offset+4]??'').padEnd(6,'0');
 let micros=BigInt(dayDate.getTime())*1000n+BigInt(fraction||'0');
 if(type==='TIMESTAMPTZ'){
  const zone=match[8]!;if(zone!=='Z'){const zh=Number(zone.slice(1,3)),zm=Number(zone.slice(4));if(zh>15||zm>59)return fail('The timestamp zone offset is invalid.');micros-=BigInt((zh*60+zm)*60)*(zone[0]==='-'?-1000000n:1000000n);}
 }
 return micros.toString();
}
export function typedLiteral(value:string,kind:'string'|'number'|'word',type:string):string{
 if(value.includes('\0'))return fail('A predicate literal cannot contain a NUL character.');
 const f=family(type);if(f==='unsupported')return fail('Row predicates require scalar columns; arrays, JSON and composite comparisons are not supported.');
 if(f==='number'||f==='float'){
  if(kind!=='number')return fail('Use a numeric literal for a numeric column; implicit coercion is not permitted.');
  if(f==='float') {const exact=floating(value,type);if(new Decimal(value).isZero()!==new Decimal(exact).isZero())return fail('The floating-point literal does not fit the column type.');return exact;}
  const n=new Decimal(value),bounds=integers[type],d=decimal.exec(type);
  if(bounds&&(!n.isInteger()||n.lt(bounds[0])||n.gt(bounds[1])))return fail(`The literal does not fit ${type}.`);
  if(d&&(n.decimalPlaces()>Number(d[2])||n.abs().gte(new Decimal(10).pow(Number(d[1])-Number(d[2])))))return fail(`The literal does not fit ${type}.`);
  return n.isZero()?'0':n.toString();
 }
 if(f==='boolean'){if(kind!=='word'||!['TRUE','FALSE'].includes(value.toUpperCase()))return fail('Use TRUE or FALSE for a boolean column.');return value.toLowerCase();}
 if(kind!=='string')return fail('Use a quoted literal of the column’s type; implicit coercion is not permitted.');
 if(f==='uuid'){if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(value))return fail('Use a UUID literal for a UUID column.');return value.toLowerCase();}
 if(f==='time'){temporal(value,type);return type==='TIMESTAMPTZ'?new Date(Number((BigInt(temporal(value,type))-((BigInt(temporal(value,type))%1000n+1000n)%1000n))/1000n)).toISOString().slice(0,19)+'.'+((BigInt(temporal(value,type))%1000000n+1000000n)%1000000n).toString().padStart(6,'0')+'Z':value;}
 return value;
}
type Token={kind:'identifier'|'string'|'number'|'word'|'symbol';value:string};
export function parsePredicate(expression:string,columns:readonly PredicateColumn[]):Result<Predicate>{
 try{
  if(!expression.trim()||expression.length>8192)return fail('Enter a row predicate of at most 8192 characters.');
  const tokens:Token[]=[];let at=0;
  while(at<expression.length){const rest=expression.slice(at),space=/^\s+/u.exec(rest);if(space){at+=space[0].length;continue;}
   const quoted=/^'(?:[^']|'')*'/u.exec(rest),identifier=/^"(?:[^"]|"")+"/u.exec(rest),number=/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/u.exec(rest),word=/^[A-Za-z_][A-Za-z_0-9]*/u.exec(rest),symbol=/^(?:<=|>=|<>|[=<>(),])/u.exec(rest);
   const match=quoted??identifier??number??word??symbol;if(!match)return fail(`Invalid predicate syntax at character ${at+1}. Only the row-expression grammar is allowed.`);
   const raw=match[0];tokens.push({kind:quoted?'string':number?'number':identifier?'identifier':word?'word':'symbol',value:quoted?raw.slice(1,-1).replaceAll("''", "'"):identifier?raw.slice(1,-1).replaceAll('""','"'):raw});at+=raw.length;
  }
  let i=0,depth=0;const peek=(s:string)=>tokens[i]?.kind!=='identifier'&&tokens[i]?.kind!=='string'&&tokens[i]?.value.toUpperCase()===s;const take=(s:string)=>{if(peek(s)){i++;return true;}return false;};const need=(s:string)=>{if(!take(s))fail(`Expected ${s} in the row predicate.`);};
  const literal=(c:PredicateColumn):string|null=>{const t=tokens[i++];if(!t) return fail('Expected a typed literal.');if(t.kind==='word'&&t.value.toUpperCase()==='NULL')return null;if(t.kind==='symbol'||t.kind==='identifier')return fail('Expected a typed literal.');return typedLiteral(t.value,t.kind,c.type);};
  const atom=():Predicate=>{
   if(++depth>32)return fail('The row predicate is nested too deeply.');
   let result:Predicate;
   if(take('NOT'))result={kind:'not',term:atom()};
   else if(take('(')){result=or();need(')');}
   else{
    const token=tokens[i++],c=columns.find(c=>(token?.kind==='word'||token?.kind==='identifier')&&c.name===token.value);if(!c)return fail('The predicate names an unknown column. Use a column exposed by this object.');
    if(family(c.type)==='unsupported')return fail('Row predicates require scalar columns; arrays, JSON and composite comparisons are not supported.');
    if(take('IS')){const negated=take('NOT');need('NULL');result={kind:'null',column:c.id,negated};}
    else{const negate=take('NOT');if(take('IN')){
      if(take('SCOPE')){need('(');const domain=tokens[i++];if(domain?.kind!=='word')return fail('Expected a scope domain name.');need(')');result={kind:'scope',column:c.id,domain:domain.value};}
      else{need('(');const values=[literal(c)];while(take(',')){if(values.length>=1000)return fail('IN accepts at most 1000 values.');values.push(literal(c));}need(')');result={kind:'in',column:c.id,values};}
      if(negate)result={kind:'not',term:result};
     }else{if(negate)return fail('NOT after a column must be followed by IN.');const operator=tokens[i++]?.value;if(!operator||!['=','<>','<','<=','>','>='].includes(operator))return fail('Expected a comparison, IN or IS NULL.');result={kind:'compare',column:c.id,operator:operator as Extract<Predicate,{kind:'compare'}>['operator'],value:literal(c)};}
    }
   }depth--;return result;
  };
  const and=():Predicate=>{const terms=[atom()];while(take('AND'))terms.push(atom());return terms.length===1?terms[0]!:{kind:'and',terms};};
  const or=():Predicate=>{const terms=[and()];while(take('OR'))terms.push(and());return terms.length===1?terms[0]!:{kind:'or',terms};};
  const result=or();if(i!==tokens.length)return fail('Unexpected predicate input. SQL, functions and cross-column comparisons are not permitted.');const normal=normalise(result);if(!predicateSchema.safeParse(normal).success)return fail('The row predicate is too complex. Use at most 128 terms per group.');return ok(normal);
 }catch(error){if(error instanceof DomainError)return err(error);return err(new DomainError('validation_failed','The predicate literal is invalid.'));}
}
export function normalise(p:Predicate):Predicate{
 if(p.kind==='and'||p.kind==='or'){const terms=p.terms.map(normalise).flatMap(t=>t.kind===p.kind?t.terms:[t]);return {kind:p.kind,terms:terms.sort((a,b)=>JSON.stringify(a)<JSON.stringify(b)?-1:JSON.stringify(a)>JSON.stringify(b)?1:0)};}
 if(p.kind==='not')return {kind:'not',term:normalise(p.term)};
 if(p.kind==='in')return {...p,values:[...new Set(p.values)].sort((a,b)=>a===b?0:a===null?-1:b===null?1:a<b?-1:1)};
 return p;
}
export function referencedColumns(p:Predicate):string[]{return [...new Set(p.kind==='and'||p.kind==='or'?p.terms.flatMap(referencedColumns):p.kind==='not'?referencedColumns(p.term):[p.column])].sort();}
export function hasScope(p:Predicate):boolean{return p.kind==='scope'||(p.kind==='and'||p.kind==='or'?p.terms.some(hasScope):p.kind==='not'&&hasScope(p.term));}

/** The same AST is edited by the builder and parsed from the text tab. */
export function predicateText(p:Predicate,columns:readonly PredicateColumn[]):string{
 if(p.kind==='and'||p.kind==='or')return '('+p.terms.map(t=>predicateText(t,columns)).join(p.kind==='and'?' AND ':' OR ')+')';
 if(p.kind==='not')return 'NOT ('+predicateText(p.term,columns)+')';
 const column=columns.find(c=>c.id===p.column);if(!column)throw new Error('Missing predicate column.');
 const name='"'+column.name.replaceAll('"','""')+'"';
 const literal=(value:string|null)=>value===null?'NULL':['number','float'].includes(family(column.type))?value:family(column.type)==='boolean'?value.toUpperCase():"'"+value.replaceAll("'","''")+"'";
 if(p.kind==='null')return name+(p.negated?' IS NOT NULL':' IS NULL');
 if(p.kind==='scope')return name+' IN scope('+p.domain+')';
 if(p.kind==='in')return name+' IN ('+p.values.map(literal).join(', ')+')';
 return name+' '+p.operator+' '+literal(p.value);
}

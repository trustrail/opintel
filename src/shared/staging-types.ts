/** Closed grammar for the compiler's exposed types. Never interpolate a type
 * declaration into SQL until this grammar has consumed the entire string. */
export function stagingType(input:string):{duck:string;postgres:string|null;complex:boolean}|null{
 let at=0;
 const take=(s:string)=>{if(input.startsWith(s,at)){at+=s.length;return true;}return false;};
 const parse=(depth:number):{duck:string;postgres:string|null;complex:boolean}|null=>{
  if(depth>32)return null;
  if(take('LIST(')){const inner=parse(depth+1);if(!inner||!take(')'))return null;return {duck:inner.duck+'[]',postgres:inner.postgres?inner.postgres+'[]':null,complex:true};}
  if(take('STRUCT(')){
   const fields:string[]=[];
   for(;;){
    const name=/^"(?:[^"\0]|"")+" /u.exec(input.slice(at));if(!name)return null;at+=name[0].length;
    const type=parse(depth+1);if(!type)return null;fields.push(name[0]+type.duck);
    if(take(')'))break;if(!take(', '))return null;
   }
   return {duck:'STRUCT('+fields.join(', ')+')',postgres:null,complex:true};
  }
  const decimal=/^DECIMAL\((\d+),(\d+)\)/u.exec(input.slice(at));
  if(decimal){const p=Number(decimal[1]),s=Number(decimal[2]);if(p<1||p>38||s<0||s>p)return null;at+=decimal[0].length;return {duck:decimal[0],postgres:decimal[0],complex:false};}
  const scalar=/^(?:TIMESTAMPTZ|TIMESTAMP|VARCHAR|BOOLEAN|TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|FLOAT|DOUBLE|DATE|TIME|UUID|JSON)/u.exec(input.slice(at));
  if(!scalar)return null;at+=scalar[0].length;const duck=scalar[0];
  return {duck,postgres:({DOUBLE:'double precision',TINYINT:'smallint',HUGEINT:'numeric(38,0)',FLOAT:'real'} as Record<string,string>)[duck]??duck,complex:duck==='JSON'};
 };
 const result=parse(0);return at===input.length?result:null;
}

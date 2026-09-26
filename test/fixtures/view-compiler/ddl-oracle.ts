// Independent B.2/B.3 grammar, intentionally not a general SQL parser.
// It consumes ALL text. Comments, functions, wildcards, literals, aliases,
// extra clauses/statements or unquoted identifiers cannot be hidden from it.
export type Projection = {view:string[]; columns:string[]; from:string[]};
type Token = {kind:'identifier'|'keyword'|'punctuation';value:string};
function lex(sql:string):Token[]{
 const tokens:Token[]=[];let at=0;
 while(at<sql.length){
  const c=sql[at]!;
  if(/\s/u.test(c)){at++;continue;}
  if(c==='"'){
   at++;let value='',closed=false;
   while(at<sql.length){
    if(sql[at]==='"'){
     if(sql[at+1]==='"'){value+='"';at+=2;continue;}
     at++;closed=true;break;
    }
    value+=sql[at++];
   }
   if(!closed||!value)throw new Error('Unterminated or empty quoted identifier');
   tokens.push({kind:'identifier',value});continue;
  }
  if('.,;'.includes(c)){tokens.push({kind:'punctuation',value:c});at++;continue;}
  const word=/^[A-Za-z_]+/u.exec(sql.slice(at))?.[0];
  if(!word)throw new Error(`Unexpected SQL token at ${at}`);
  tokens.push({kind:'keyword',value:word.toUpperCase()});at+=word.length;
 }
 return tokens;
}
export function parseProjection(sql:string):Projection {
 const tokens=lex(sql);let at=0;
 const take=(kind:Token['kind'],value?:string)=>{
  const token=tokens[at++];
  if(!token||token.kind!==kind||(value!==undefined&&token.value!==value))throw new Error(`Expected ${kind} ${value??''}, received ${JSON.stringify(token)}`);
  return token.value;
 };
 const keyword=(value:string)=>take('keyword',value);
 const qualified=()=>{const names=[take('identifier')];while(tokens[at]?.value==='.'&&tokens[at]?.kind==='punctuation'){at++;names.push(take('identifier'));}return names;};
 keyword('CREATE');keyword('VIEW');const view=qualified();keyword('AS');keyword('SELECT');
 const columns=[take('identifier')];
 while(tokens[at]?.value===','&&tokens[at]?.kind==='punctuation'){at++;columns.push(take('identifier'));}
 keyword('FROM');const from=qualified();
 if(tokens[at]?.value===';'&&tokens[at]?.kind==='punctuation')at++;
 if(at!==tokens.length)throw new Error('SQL remains after the projection');
 return {view,columns,from};
}
// Quoting does NOT make case distinct in the target engine. Only ASCII folds:
// https://duckdb.org/docs/current/sql/dialect/keywords_and_identifiers
export const identifierKey=(name:string)=>name.replace(/[A-Z]/gu,c=>String.fromCharCode(c.charCodeAt(0)+32));

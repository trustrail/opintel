/** Opt-in SQL shape accounting. Never retain or emit SQL, bind values or literals.
 * Relations are statement references, not physical I/O; RLS/trigger reads are
 * outside this observer. Unknown syntax/dynamic SQL remains explicit. */
export type SqlMetadata={name:string;kind:'view'|'function';definition:string;volatile?:boolean};
export type SqlAccess={read:boolean;write:boolean;unknown:boolean;readTables:Set<string>;writeTables:Set<string>;opaque:Set<string>};
const metadata=new Map<string,SqlMetadata>();
export function configureSqlDiagnostics(items:SqlMetadata[]):void{metadata.clear();for(const item of items)metadata.set(item.name,item);}
export function sqlAccess():SqlAccess{return {read:false,write:false,unknown:false,readTables:new Set(),writeTables:new Set(),opaque:new Set()};}
function tokens(sql:string):string[]{
 const safe=sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|'(?:''|\\.|[^'])*'|\$\$[\s\S]*?\$\$|\$([a-zA-Z_]\w*)\$[\s\S]*?\$\1\$/g,' ');
 return safe.match(/"(?:""|[^"])*"|[a-zA-Z_][\w$]*|[().,;]/g)??[];
}
const ident=(token:string|undefined)=>token!==undefined&&/^(?:"|[a-zA-Z_])/.test(token);
const name=(token:string)=>token.startsWith('"')?token.slice(1,-1).replaceAll('""','"'):token.toLowerCase();
export function observeSql(access:SqlAccess,sql:string,seen=new Set<string>()):void{
 const ts=tokens(sql),ctes=new Set<string>();
 if(ts.length===0){access.unknown=true;return;}
 if(ts[0]?.toUpperCase()==='SELECT'&&ts.some(t=>t.toLowerCase()==='pg_advisory_xact_lock'))return;
 // CTE names are local bindings, not tables. Their inner statements are scanned too.
 for(let i=0;i<ts.length;i++)if((ts[i]?.toUpperCase()==='WITH'||ts[i]===',')&&ident(ts[i+1])){
  let j=i+1;if(ts[j]?.toUpperCase()==='RECURSIVE')j++;
  if(ts[j+1]?.toUpperCase()==='AS'||ts[j+1]==='('&&ts.slice(j+1,j+20).some(t=>t.toUpperCase()==='AS'))ctes.add(name(ts[j]!));
 }
 const relation=(at:number,write:boolean)=>{
  if(ts[at]?.toUpperCase()==='ONLY')at++;
  if(!ident(ts[at]))return;
  let relationName=name(ts[at]!);if(ts[at+1]==='.'&&ident(ts[at+2])){relationName+='.'+name(ts[at+2]!);at+=2;}
  const short=relationName.replace(/^public\./,'');
  if(ctes.has(short))return;
  if(ts[at+1]==='('&&!write){const fn=metadata.get(short);if(fn)expand(fn);return;}
  const view=metadata.get(short);if(view?.kind==='view'&&!write){expand(view);return;}
  (write?access.writeTables:access.readTables).add(relationName);
 };
 const expand=(item:SqlMetadata)=>{
  if(seen.has(item.name))return;seen.add(item.name);
  observeSql(access,item.definition,seen);
  // Volatility alone does not mean a write. Dynamic SQL cannot be classified.
  if(/\bEXECUTE\b/i.test(tokens(item.definition).join(' '))){access.unknown=true;access.opaque.add(item.name);}
 };
 for(let i=0;i<ts.length;i++){
  const token=ts[i]!,keyword=token.toUpperCase();
  if(keyword==='SELECT'){access.read=true;}
  if(keyword==='INSERT'||keyword==='UPDATE'&&ts[i-1]?.toUpperCase()!=='FOR'||keyword==='DELETE'||keyword==='MERGE'){access.write=true;}
  if(['CREATE','ALTER','DROP','TRUNCATE','COPY','EXECUTE'].includes(keyword)||['CALL','DO'].includes(keyword)&&i===0){access.unknown=true;}
  if(keyword==='FROM'||keyword==='JOIN')relation(i+1,ts[i-1]?.toUpperCase()==='DELETE');
  if(keyword==='UPDATE'&&ts[i-1]?.toUpperCase()!=='FOR'&&ts[i-1]?.toUpperCase()!=='DO'&&ts[i+1]?.toUpperCase()!=='SET')relation(i+1,true);
  if(keyword==='INTO'&&['INSERT','MERGE'].includes(ts[i-1]?.toUpperCase()??''))relation(i+1,true);
  if(ident(token)&&ts[i+1]==='('){const item=metadata.get(name(token));if(item?.kind==='function')expand(item);}
 }
}
export function sqlAccessKind(access:SqlAccess):'read'|'write'|'both'|'none'|'unknown'{return access.read&&access.write?'both':access.unknown?'unknown':access.write?'write':access.read?'read':'none';}

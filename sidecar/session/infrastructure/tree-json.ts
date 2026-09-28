/** Native JSON contains int64 constants and uint64 source offsets. JavaScript
 * JSON.parse would round them. Keep large integer tokens exact; source offsets
 * are diagnostic metadata and may be normalized when rendering a new tree. */
export function parseTreeJson(json:string):unknown{
 const exact=json.replace(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/gu,token=>{
  if(token.startsWith('"')||! /^-?\d+$/u.test(token)||Number.isSafeInteger(Number(token)))return token;
  return JSON.stringify(token);
 });
 return JSON.parse(exact,(key,value:unknown)=>key==='query_location'&&typeof value==='string'?0:value) as unknown;
}
export function renderTreeJson(tree:unknown):string{
 const write=(value:unknown,parent?:Record<string,unknown>,key?:string):string=>{
  if(key==='query_location')return '0';
  if(typeof value==='string'&&key==='value'&&parent?.type&&typeof parent.type==='object'&&'id' in parent.type&&['BIGINT','DECIMAL'].includes(String(parent.type.id))&&/^-?\d+$/u.test(value))return value;
  if(Array.isArray(value))return '['+value.map(v=>write(v)).join(',')+']';
  if(value&&typeof value==='object'){const r=value as Record<string,unknown>;return '{'+Object.entries(r).map(([k,v])=>JSON.stringify(k)+':'+write(v,r,k)).join(',')+'}';}
  const json=JSON.stringify(value);if(json===undefined)throw new Error('Invalid tree value.');return json;
 };
 return write(tree);
}

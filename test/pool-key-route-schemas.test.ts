import { readFile,readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect,it } from 'vitest';
import { z } from 'zod';
import ts from 'typescript';
import type { defineRoute } from '../src/platform/http/index.js';
async function files(root:string):Promise<string[]>{return (await Promise.all((await readdir(root,{withFileTypes:true})).map(e=>e.isDirectory()?files(`${root}/${e.name}`):Promise.resolve(e.name.endsWith('.ts')?[`${root}/${e.name}`]:[])))).flat();}
function credentialFields(schema:unknown,path=''):string[]{
 if(schema===null||typeof schema!=='object')return [];
 const object=schema as Record<string,unknown>;
 const fields=object.properties&&typeof object.properties==='object'?Object.keys(object.properties).filter(name=>/^(key|poolKey|plaintextKey|plaintext|key_hash|keyHash|credential)$/iu.test(name)).map(name=>`${path}.${name}`):[];
 return [...fields,...Object.entries(object).flatMap(([name,value])=>credentialFields(value,`${path}.${name}`))];
}
it('I-003: scans every application route response schema; only initial creation and rotation can contain plaintext',async()=>{
 const routes:ReturnType<typeof defineRoute>[]=[];
 // Discover factories from source, including factories not yet mounted by start.ts.
 // Dependencies are not used until handle runs; a throwing stub catches accidental work.
 const stub=new Proxy(()=>{throw new Error('Route discovery must not execute services');},{get:()=>stub});
 for(const file of [...await files('src/modules'),...await files('src/platform')]){
  const source=ts.createSourceFile(file,await readFile(file,'utf8'),ts.ScriptTarget.Latest,true);
  let declaresRoutes=false;
  const visit=(node:ts.Node):void=>{if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='defineRoute')declaresRoutes=true;ts.forEachChild(node,visit);};
  visit(source);if(!declaresRoutes)continue;
  const module=await import(resolve(file)) as Record<string,unknown>;
  const factories=Object.entries(module).filter(([name,value])=>name.endsWith('Routes')&&typeof value==='function');
  expect(factories.length,`Unscanned route factory in ${file}`).toBeGreaterThan(0);
  for(const [,factory] of factories)routes.push(...(factory as (dependency:unknown)=>ReturnType<typeof defineRoute>[])(stub));
 }
 expect(routes.length).toBeGreaterThan(35);
 const exceptions=new Set(['POST /api/v1/projects/:id/pools','POST /api/v1/pools/:id/keys/rotate']);
 const found:string[]=[];
 for(const route of routes){
  const key=`${route.method} ${route.path}`,fields=credentialFields(z.toJSONSchema(route.response,{unrepresentable:'any'}));
  if(fields.length){found.push(key);expect(exceptions.has(key),`${key}: ${fields.join(', ')}`).toBe(true);expect(fields.every(field=>field.endsWith('.key'))).toBe(true);}
 }
 expect(found.sort()).toEqual([...exceptions].sort());
},30_000);

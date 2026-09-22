import { ESLint } from 'eslint';
import { execFile } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { canonicalisers, createCanonicaliserRegistry } from '../sidecar/tokenize/canonicalisers/index.ts';
import { fixture1, fixture2 } from './fixtures/canonicalisers/reviewed.ts';
const registry = createCanonicaliserRegistry([...canonicalisers.entries,fixture1,fixture2]);
const generated = {text:['','Straße','ＡＢＣ','e\u0301','\ufeff text ','İ','😀'],number:[],date:[],timestamp:[]};
for(let i=0;i<128;i++){
 generated.text.push(`AB-${i} ${String.fromCodePoint(0x400+i)}`);
 generated.number.push(`${i%2?'-':''}${i}.${String(i*17).padStart(4,'0')}00`);
 const day=`${2000+i%25}-${String(i%12+1).padStart(2,'0')}-${String(i%28+1).padStart(2,'0')}`;
 generated.date.push(day);generated.timestamp.push(`${day}T12:34:56.${String(i).padStart(6,'0')}+02:00`);
}
describe('TOK-24 reviewed canonicaliser registration',()=>{
 it('ships only the four built-ins and requires unique versioned ids and fixed vectors',()=>{
  expect(canonicalisers.ids).toEqual(['stddate1','stdnum1','stdtext1','stdtime1']);
  for(const canonId of ['bad_id','Bad1','name','bad\n',''])expect(()=>createCanonicaliserRegistry([{...fixture1,canonId}])).toThrow();
  expect(()=>createCanonicaliserRegistry([fixture1,fixture1])).toThrow();
  expect(()=>createCanonicaliserRegistry([{...fixture1,vectors:[]}])).toThrow();
 });
 it('lint rejects the clock fixture and forbidden capabilities, while local helpers are allowed',async()=>{
  const eslint=new ESLint();
  const [clock]=await eslint.lintFiles(['test/fixtures/canonicalisers/clock.ts']);
  expect(clock.messages.some(m=>m.ruleId==='opintel/canonicaliser-purity')).toBe(true);
  for(const code of ["import fs from 'node:fs'; fs.readFileSync('x');",'Math.random();','Math["random"]();','const {random}=Math; random();','process.cwd();','globalThis.fetch("x");','fetch("x");','eval("1");','new Function("return 1");']){
   const [result]=await eslint.lintText(code,{filePath:'sidecar/tokenize/canonicalisers/probe.ts'});
   expect(result.messages.some(m=>m.ruleId==='opintel/canonicaliser-purity'),code).toBe(true);
  }
  const [valid]=await eslint.lintText("import { helper } from './helper.js'; export const result = helper('x');",{filePath:'sidecar/tokenize/canonicalisers/probe.ts'});
  expect(valid.messages).toEqual([]);
 });
 it('every registered canonicaliser satisfies its fixed input-to-output vectors',()=>{
  for(const entry of registry.entries)for(const vector of entry.vectors)expect(entry.canonicalise(vector.input),entry.canonId).toBe(vector.output);
 });
 it('every registered canonicaliser is deterministic over generated inputs and a fresh process',async()=>{
  const expected=registry.entries.map(entry=>({id:entry.canonId,outputs:generated[entry.mode].map(input=>entry.canonicalise(input))}));
  for(let pass=0;pass<5;pass++)for(const entry of registry.entries){
   // Reverse input order catches accidental dependence on the preceding value.
   expect([...generated[entry.mode]].reverse().map(input=>entry.canonicalise(input)).reverse()).toEqual(expected.find(r=>r.id===entry.canonId).outputs);
  }
  const child=execFile(process.execPath,['--import','tsx','test/fixtures/canonicaliser-determinism-worker.ts'],{env:{...process.env,TZ:'Pacific/Auckland'},maxBuffer:1024*1024});
  const result=new Promise((resolve,reject)=>{let stdout='',stderr='';child.stdout.on('data',x=>stdout+=x);child.stderr.on('data',x=>stderr+=x);child.on('error',reject);child.on('close',code=>code===0?resolve({stdout,stderr}):reject(new Error(stderr)));});
  child.stdin.end(JSON.stringify(generated));
  expect(JSON.parse((await result).stdout)).toEqual(expected);
 },15000);
});

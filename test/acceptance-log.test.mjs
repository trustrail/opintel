import {mkdtempSync,statSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import process from 'node:process';
import {it,expect} from 'vitest';
import {captureProcessLog} from '../scripts/images/acceptance-log.mjs';

it('retains logs larger than the acceptance buffer limit in a private file',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-log-')),file=join(directory,'service.log');
 try{
  captureProcessLog(process.execPath,['-e',"require('node:fs').writeSync(1,Buffer.alloc(20*1024*1024,120));require('node:fs').writeSync(2,'done')"],file);
  expect(statSync(file).size).toBe(20*1024*1024+4);
  expect(statSync(file).mode&0o777).toBe(0o600);
 }finally{rmSync(directory,{recursive:true,force:true});}
});
it('reports a failed capture and preserves its diagnostic output',()=>{
 const directory=mkdtempSync(join(tmpdir(),'acceptance-log-')),file=join(directory,'service.log');
 try{
  expect(()=>captureProcessLog(process.execPath,['-e',"console.error('synthetic capture failure');process.exit(7)"],file)).toThrow('Log capture failed (7); private log: '+file);
  expect(readFileSync(file,'utf8')).toContain('synthetic capture failure');
 }finally{rmSync(directory,{recursive:true,force:true});}
});

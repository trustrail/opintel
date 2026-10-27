import {mkdtempSync,readFileSync,readdirSync,rmSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {expect,it,vi} from 'vitest';
import {DomainError} from '../src/shared/kernel/index.js';
import {operatorDiagnostic} from '../scripts/operator/diagnostics.js';
it('operator diagnostics print domain refusal messages without serializing details or credentials',()=>{
 const directory=mkdtempSync(join(tmpdir(),'operator-diagnostic-')),log=vi.spyOn(console,'error').mockImplementation(()=>{});
 try{
  operatorDiagnostic(new DomainError('source_unavailable','Engine TLS verification refused.',{privateDetail:'must-not-be-logged'}),directory,'/private/job');
  const file=readdirSync(directory)[0]!;
  expect(log).toHaveBeenCalledWith('Engine TLS verification refused. Log: /private/job/'+file);
  expect(readFileSync(join(directory,file),'utf8')).toBe('Engine TLS verification refused.\n');
  expect(statSync(join(directory,file)).mode&0o777).toBe(0o600);
 }finally{log.mockRestore();rmSync(directory,{recursive:true,force:true});}
});

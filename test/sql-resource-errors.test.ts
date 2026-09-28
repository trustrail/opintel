import { expect,it } from 'vitest';
import { DuckDBSessionEngine,type SessionEngine } from '../sidecar/session/index.js';
import { InspectedSessionExecutor } from '../sidecar/sql/index.js';
import { sqlPolicy } from './fixtures/sql-policy.js';

it('a real execution error returns a structured envelope without source values and closes both sessions',async()=>{
 const closed:string[]=[],driver=new DuckDBSessionEngine();
 const engine:SessionEngine={open:async role=>{
  const session=await driver.open(role);
  if(role==='agent')await session.execute('CREATE TABLE t(value BIGINT); INSERT INTO t VALUES (-9223372036854775808)');
  return {...session,close:()=>{closed.push(role);session.close();}};
 }};
 const namespace={catalog:'memory',schema:'main',objects:[{catalog:'memory',schema:'main',name:'t'}]};
 const policy=sqlPolicy([{...namespace.objects[0]!,columns:[{name:'value'}]}]);
 const result=await new InspectedSessionExecutor(engine).execute('SELECT abs(value) FROM t',{memoryMb:32,threads:1},namespace,policy);
 expect(result).toMatchObject({ok:false,error:{code:'dependency_unavailable'}});
 expect(JSON.stringify(result)).not.toContain('9223372036854775808');
 expect(result).not.toHaveProperty('value');expect(closed).toEqual(['agent','privileged']);
});

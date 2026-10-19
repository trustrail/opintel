import {it,expect,vi} from 'vitest';
import {resolve} from 'node:path';
import {sidecarConfigSchema} from '../sidecar/config.js';
import {checkQueryReadiness} from '../sidecar/readiness.js';
import {DuckDBSessionEngine,type SessionEngine} from '../sidecar/session/index.js';
import {PostgresSourceScope} from '../sidecar/infrastructure/postgres-source-scope.js';
const config=()=>sidecarConfigSchema.parse({host:'127.0.0.1',port:0,tls:{caFile:'ca',certFile:'cert',keyFile:'key',clientPinFile:'pin'},auditFile:'audit',postgresExtension:resolve('tmp/duckdb-extensions/postgres_scanner.duckdb_extension'),postgresReadinessSource:'secret://test/readiness',limits:{maxConnectionsPerSource:1,statementTimeoutMs:2000,operationTimeoutMs:4000}});
const scope=()=>new PostgresSourceScope({resolve:async()=>process.env.TEST_DATABASE_URL!},config().limits);
it('E-10: missing scanner or source refuses before a session or source opens',async()=>{
 const open=vi.fn(),external=vi.fn();
 await expect(checkQueryReadiness({...config(),postgresExtension:undefined},{external},{open})).rejects.toThrow('Scanner configuration missing');
 await expect(checkQueryReadiness({...config(),postgresReadinessSource:undefined,demo:{database:'demo',credentialRef:config().postgresReadinessSource!}},{external},{open})).rejects.toThrow('set postgresReadinessSource explicitly');
 expect(open).not.toHaveBeenCalled();expect(external).not.toHaveBeenCalled();
});
it('E-10: signed scanner stages only a constant through Postgres, verifies memory and closes',async()=>{
 const native=new DuckDBSessionEngine(undefined,undefined,config().postgresExtension),queries:string[]=[],closed=vi.fn();
 const engine:SessionEngine={open:async role=>{expect(role).toBe('privileged');const session=await native.open(role),materialize=session.staging!.materialize,close=session.close;
 session.staging!.materialize=async(...args)=>{queries.push(args[1]);expect(args[3]).toEqual([{name:'ready',type:'INTEGER'}]);await materialize(...args);};
 session.close=()=>{closed();close();};return session;}};
 expect(await checkQueryReadiness(config(),scope(),engine)).toContain('v1.4.3');
 expect(queries).toEqual(['SELECT 1 AS ready']);expect(closed).toHaveBeenCalledTimes(1);
});
it('E-10: incompatible extension and unreachable source fail readiness',async()=>{
 await expect(checkQueryReadiness({...config(),postgresExtension:resolve('missing-scanner')},scope())).rejects.toThrow();
 const native=new DuckDBSessionEngine(undefined,undefined,config().postgresExtension),closed=vi.fn();
 const engine:SessionEngine={open:async role=>{const session=await native.open(role),close=session.close;session.close=()=>{closed();close();};return session;}};
 const offline=new PostgresSourceScope({resolve:async()=> 'postgres://unavailable:secret@127.0.0.1:1/unavailable'},config().limits);
 await expect(checkQueryReadiness(config(),offline,engine)).rejects.toThrow('refused the connection');expect(closed).toHaveBeenCalledTimes(1);
});
it('E-10: wrong materialised constant fails and closes rather than reporting ready',async()=>{
 const native=new DuckDBSessionEngine(undefined,undefined,config().postgresExtension),closed=vi.fn();
 const engine:SessionEngine={open:async role=>{const session=await native.open(role),close=session.close;session.execute=async()=>({columns:['ready'],rows:[[0]]});session.close=()=>{closed();close();};return session;}};
 await expect(checkQueryReadiness(config(),scope(),engine)).rejects.toThrow('unexpected constant probe result');expect(closed).toHaveBeenCalledTimes(1);
});
it('E-10: query engine initialization failure is not mislabeled as scanner load failure',async()=>{
 const external=vi.fn(),open=vi.fn(async()=>{throw new Error('Memory allocation failed');});
 await expect(checkQueryReadiness(config(),{external},{open})).rejects.toMatchObject({reason:'query_engine_initialization_failed'});
 expect(external).not.toHaveBeenCalled();
});

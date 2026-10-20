import {it,expect,afterEach} from 'vitest';
import {configureSqlDiagnostics,observeSql,sqlAccess,sqlAccessKind} from '../src/platform/db/sql-diagnostics.js';
afterEach(()=>configureSqlDiagnostics([]));
it('X-05: access classification ignores values/comments and row locks; identifies writes and mixed scopes',()=>{
 const access=sqlAccess();observeSql(access,"SELECT p.id FROM project p JOIN pool k ON true WHERE p.name='UPDATE secret_value' /* DELETE FROM private */ FOR UPDATE");
 expect(sqlAccessKind(access)).toBe('read');expect([...access.readTables].sort()).toEqual(['pool','project']);
 observeSql(access,'INSERT INTO query_run(id) VALUES($1) ON CONFLICT(id) DO UPDATE SET id=excluded.id');expect(sqlAccessKind(access)).toBe('both');expect([...access.writeTables]).toEqual(['query_run']);expect(JSON.stringify([...access.readTables])).not.toContain('secret_value');
 const write=sqlAccess();observeSql(write,'UPDATE agent_presence SET state=$1 WHERE pool_id=$2');expect(sqlAccessKind(write)).toBe('write');
});
it('X-05: static views/functions expand and CTE aliases are not reported as tables',()=>{
 configureSqlDiagnostics([{name:'evidence_run_read',kind:'view',definition:'SELECT id FROM query_run UNION ALL SELECT id FROM evidence_rollup'},{name:'resolve_pool_key',kind:'function',definition:'SELECT k.id FROM public.pool_key k JOIN public.pool p ON true'}]);
 const access=sqlAccess();observeSql(access,'WITH recent AS (SELECT * FROM evidence_run_read) SELECT * FROM recent JOIN public.resolve_pool_key($1) k ON true');
 expect([...access.readTables].sort()).toEqual(['evidence_rollup','public.pool','public.pool_key','query_run']);expect(sqlAccessKind(access)).toBe('read');
});
it('X-05: mutating functions and dynamic SQL are explicit rather than assumed read-only',()=>{
 configureSqlDiagnostics([{name:'record_custody_check',kind:'function',definition:'INSERT INTO observation_event(id) VALUES(value);'},{name:'provision_evidence_partitions',kind:'function',definition:"BEGIN EXECUTE 'CREATE TABLE secret_value()'; END"}]);
 const both=sqlAccess();observeSql(both,'SELECT record_custody_check($1)');expect(sqlAccessKind(both)).toBe('both');expect([...both.writeTables]).toEqual(['observation_event']);
 const unknown=sqlAccess();observeSql(unknown,'SELECT provision_evidence_partitions()');expect(sqlAccessKind(unknown)).toBe('unknown');expect([...unknown.opaque]).toEqual(['provision_evidence_partitions']);
});

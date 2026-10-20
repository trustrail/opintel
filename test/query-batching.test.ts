import {afterEach,expect,it,vi} from 'vitest';
import * as scopes from '../src/platform/db/scope.js';
import {PostgresEntitlementReader} from '../src/modules/entitlements/index.js';
import {PostgresQueryReader} from '../src/modules/mcp/infrastructure/query-reader.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
import type {McpPrincipal} from '../src/modules/mcp/application/access.js';
afterEach(()=>vi.restoreAllMocks());

it.each([3,500])('X05-BATCH-001: %i columns and their decisions use one catalogue read, including pool limits',async count=>{
 const f=await policyFixture(count);await f.set('clear');
 const original=scopes.withTenant,statements:string[]=[];
 vi.spyOn(scopes,'withTenant').mockImplementation((ctx,work)=>original(ctx,tx=>work({query:<T>(sql:string,params?:readonly unknown[])=>{statements.push(sql);return tx.query<T>(sql,params);}})));
 const result=unwrap(await new PostgresEntitlementReader().compilation(f.ctx,f.pool));
 expect(result.compilation.views.flatMap(v=>v.columns)).toHaveLength(count);
 expect(result.compilation.views.flatMap(v=>v.columns).every(c=>c.treatment==='clear')).toBe(true);
 expect(statements).toHaveLength(1);
 expect(statements[0]).toContain('row_scopes AS');
 expect(result.pool).toHaveProperty('budgets');
});

it('X05-BATCH-002: query limits come from the same pool snapshot; a later read sees a changed decision',async()=>{
 const f=await policyFixture(3);await f.set('clear');
 await scopes.withPlatform(tx=>tx.query("UPDATE project SET settings=jsonb_set(settings,'{query}', $2::jsonb,true) WHERE id=$1",[f.ctx.projectId,{rowLimit:100,timeoutSeconds:10,memoryLimitMb:128,concurrencyPerPool:2,aggregateMinGroupSize:5}]));
 await scopes.withTenant(f.ctx,tx=>tx.query("UPDATE pool SET mode_query=true,budgets='{}'::jsonb || jsonb_build_object('threads',1) WHERE id=$1",[f.pool]));
 const principal={pool:{id:f.pool,projectId:f.ctx.projectId},scopeUserId:f.ctx.userId} as McpPrincipal;
 const original=scopes.withTenant,statements:string[]=[];
 const spy=vi.spyOn(scopes,'withTenant').mockImplementation((ctx,work)=>original(ctx,tx=>work({query:<T>(sql:string,params?:readonly unknown[])=>{statements.push(sql);return tx.query<T>(sql,params);}})));
 const first=unwrap(await new PostgresQueryReader().read(principal));
 expect('limits' in first&&first.limits.rowLimit).toBe(100);expect(statements).toHaveLength(1);
 spy.mockRestore();await f.set('withheld');
 const second=unwrap(await new PostgresQueryReader().read(principal));
 expect(second.compilation.views).toHaveLength(0);expect(second.compilation.omitted[0]?.reason).toBe('all_withheld');
});

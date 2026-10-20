import {randomUUID} from 'node:crypto';
import {afterEach,expect,it,vi} from 'vitest';
import {EngineRegistry,PostgresEngineRepository} from '../src/modules/engines/index.js';
import {withTenant} from '../src/platform/db/scope.js';
import {SourceId,ok} from '../src/shared/kernel/index.js';
import {policyFixture,unwrap} from './fixtures/policy-version/fixture.js';
afterEach(()=>vi.restoreAllMocks());

it('X05-BATCH-003: routes a source set in one read, attests each engine once, and rereads authority next time',async()=>{
 const f=await policyFixture(2),repo=new PostgresEngineRepository();
 const health=vi.fn(async()=>ok({contract:3,queryEngineVersion:'fixture',canonicalisers:[]}));
 const sentinel=vi.fn(async()=>ok({version:1,sentinel:'fixture-sentinel'}));
 const registry=new EngineRegistry(repo,{health,sentinel},{ca:'fixture',cert:'fixture',key:'fixture'});
 const engine=unwrap(await registry.register(f.ctx,{name:'Batch fixture',address:'https://127.0.0.1:9443',certificatePin:'00'.repeat(32)}));
 unwrap(await registry.verify(f.ctx,engine.id));
 const second=SourceId(randomUUID());
 await withTenant(f.ctx,async tx=>{
  await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref,status) VALUES($1,$2,'Second','second','postgres','secret://test/second','connected')",[second,f.ctx.projectId]);
  await tx.query("INSERT INTO token_key_version(project_id,version,sentinel_token,state) VALUES($1,1,'fixture-sentinel','current')",[f.ctx.projectId]);
 });
 unwrap(await repo.assign(f.ctx,f.source,engine.id));unwrap(await repo.assign(f.ctx,second,engine.id));
 health.mockClear();sentinel.mockClear();
 const routes=vi.spyOn(repo,'routes'),get=vi.spyOn(repo,'get'),source=vi.spyOn(repo,'source'),key=vi.spyOn(repo,'key');
 const result=await registry.forSources(f.ctx,[{id:f.source,tokenized:true},{id:second,tokenized:true},{id:f.source,tokenized:true}]);
 expect(result.map(unwrap).map(r=>r.baseUrl)).toEqual(Array(3).fill('https://127.0.0.1:9443'));
 expect(routes).toHaveBeenCalledTimes(1);expect(routes.mock.calls[0]?.[1]).toEqual([f.source,second]);
 expect(get).not.toHaveBeenCalled();expect(source).not.toHaveBeenCalled();expect(key).toHaveBeenCalledTimes(1);
 expect(health).toHaveBeenCalledTimes(1);expect(sentinel).toHaveBeenCalledTimes(1);
 await registry.update(f.ctx,engine.id,{name:'Changed',address:'https://127.0.0.1:9443',certificatePin:'11'.repeat(32)});
 const changed=await registry.forSources(f.ctx,[{id:f.source},{id:second}]);
 expect(changed.every(r=>!r.ok&&r.error.code==='source_unavailable')).toBe(true);
 expect(routes).toHaveBeenCalledTimes(2);expect(health).toHaveBeenCalledTimes(1);
});

it('X05-BATCH-004: a batch keeps missing assignments and foreign sources as separate refusals',async()=>{
 const f=await policyFixture(1),other=await policyFixture(1),repo=new PostgresEngineRepository();
 const health=vi.fn(async()=>ok({contract:3,queryEngineVersion:'fixture',canonicalisers:[]}));
 const registry=new EngineRegistry(repo,{health,sentinel:async()=>ok({version:null,sentinel:null})},{ca:'fixture',cert:'fixture',key:'fixture'});
 const result=await registry.forSources(f.ctx,[{id:f.source},{id:other.source}]);
 expect(result[0]).toMatchObject({ok:false,error:{code:'source_unavailable'}});
 expect(result[1]).toMatchObject({ok:false,error:{code:'not_found'}});
 expect(health).not.toHaveBeenCalled();
});

import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { withTenant, withPlatform } from '../../src/platform/db/scope.js';
import { createHttpServer } from '../../src/platform/http/index.js';
import { catalogRoutes } from '../../src/modules/catalog/api/tree-routes.js';
import { PostgresCatalogTreeReader } from '../../src/modules/catalog/infrastructure/tree.js';
import { ProjectId, UserId, SourceId, Timestamp } from '../../src/shared/kernel/index.js';
import type { AuthorizationPort, AuthorizationRevision } from '../../src/modules/authz/index.js';
import { resetDatabaseBeforeEach } from '../database-fixture.js';
import { CatalogTreeResponse } from '../../src/shared/api/catalog.js';

const userId = UserId(randomUUID()); const projectId = ProjectId(randomUUID()); const otherProject = ProjectId(randomUUID());
const sourceId = SourceId(randomUUID()); const objectId = randomUUID(); const otherSource = SourceId(randomUUID());
const ctx = { projectId, userId };
let server: ReturnType<typeof createHttpServer>; let origin: string; let allowed = true;
const get = (query = '', project = projectId) => fetch(`${origin}/api/v1/projects/${project}/catalog${query}`);
const page = async (query = '') => { const response = await get(query); expect(response.status).toBe(200); return CatalogTreeResponse.parse(await response.json()); };

describe('catalogue tree scoped to real Postgres', () => {
  resetDatabaseBeforeEach('company');
  beforeEach(async () => {
    allowed = true;
    await withPlatform(async tx => {
      const [industry] = await tx.query<{id:string}>('SELECT id FROM industry LIMIT 1');
      const [company] = await tx.query<{id:string}>("INSERT INTO company(name,default_region) VALUES('Catalogue','eu-west-1') RETURNING id");
      await tx.query("INSERT INTO project(id,company_id,industry_id,name,region) VALUES($1,$3,$4,'A','eu-west-1'),($2,$3,$4,'B','eu-west-1')", [projectId,otherProject,company!.id,industry!.id]);
    });
    for (const [project, id] of [[projectId, sourceId],[otherProject, otherSource]] as const) await withTenant({projectId:project,userId}, async tx => {
      await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref) VALUES($1,$2,'Renamed Warehouse','original_warehouse','postgres','secret://test/catalog')",[id,project]);
    });
    await withTenant(ctx, async tx => {
      await tx.query("INSERT INTO catalog_object(id,source_id,project_id,schema_name,object_name,object_kind,exposed_schema,exposed_name) VALUES($1,$2,$3,'Source Schema','Source Table','table','public','stored_table')",[objectId,sourceId,projectId]);
      await tx.query(`INSERT INTO catalog_element(object_id,project_id,source_identifier,exposed_name,source_type,exposed_type) VALUES
        ($1,$2,'Source Number','stored_number','int4','INTEGER'),($1,$2,'Source Text','stored_text','text','VARCHAR'),
        ($1,$2,'Source Unsupported','stored_unsupported','geometry',NULL),($1,$2,'---',NULL,'text','VARCHAR')`,[objectId,projectId]);
    });
    const unexpected = async (): Promise<never> => { throw new Error('Unexpected authorization operation'); };
    const authorization: AuthorizationPort = { check:async request => { expect(request.permission).toBe('view'); return {allowed, token:'test' as AuthorizationRevision,checkedAt:Timestamp(new Date()),snapshotAgeMs:0}; },checkMany:unexpected,write:unexpected,explain:unexpected };
    server = createHttpServer(catalogRoutes(new PostgresCatalogTreeReader()), { authorization: {port:authorization,currentUser:async()=>({id:userId,email:'catalog@example.com',fullName:null,timezone:'UTC',method:'magic_link',sessionCreatedAt:Timestamp(new Date()),deviceConfirmed:true})},logger:{error:()=>{}} });
    server.listen(0,'127.0.0.1'); await once(server,'listening'); const address = server.address(); if(!address||typeof address==='string')throw new Error(); origin=`http://127.0.0.1:${address.port}`;
  });
  afterEach(async () => { if(server)await new Promise<void>(resolve=>server.close(()=>resolve())); });

  it('R-002: 50,000 elements remain bounded, cursor paginated, and cannot cross scope or prefix', async () => {
    await withTenant(ctx,tx=>tx.query(`INSERT INTO catalog_element(object_id,project_id,source_identifier,exposed_name,source_type,exposed_type)
      SELECT $1,$2,'Column '||n,'column_'||n,'int4','INTEGER' FROM generate_series(1,50000) n`,[objectId,projectId]));
    const first = await page(`?parent=${objectId}`); expect(first.nodes).toHaveLength(50); expect(first.nextCursor).not.toBeNull();
    const second = await page(`?parent=${objectId}&cursor=${first.nextCursor}`); expect(second.nodes).toHaveLength(50);
    expect(new Set([...first.nodes,...second.nodes].map(n=>n.id)).size).toBe(100);
    for (const query of [`?cursor=${first.nextCursor}`,`?parent=${objectId}&prefix=column_&cursor=${first.nextCursor}`]) expect((await get(query)).status).toBe(400);
    expect((await get(`?parent=${objectId}&cursor=${first.nextCursor}`,otherProject)).status).toBe(400);
    const clamped = await get(`?parent=${objectId}&limit=50000`); expect(clamped.headers.get('warning')).toContain('500'); expect(CatalogTreeResponse.parse(await clamped.json()).nodes).toHaveLength(500);
  }, 30_000);

});

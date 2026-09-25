import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { Client } from 'pg';
import { beforeEach, afterEach, describe, it, expect } from 'vitest';
import { withTenant, withPlatform } from '../src/platform/db/scope.js';
import { createHttpServer } from '../src/platform/http/index.js';
import { catalogRoutes } from '../src/modules/catalog/api/tree-routes.js';
import { PostgresCatalogTreeReader } from '../src/modules/catalog/infrastructure/tree.js';
import { PostgresSourceRegistrationRepository } from '../src/modules/sources/infrastructure/source-registration-repository.js';
import { CatalogNaming, AsciiTransliterator } from '../src/modules/catalog/index.js';
import { ProjectId, UserId, SourceId, RunId, Timestamp, ExposedName } from '../src/shared/kernel/index.js';
import type { AuthorizationPort, AuthorizationRevision } from '../src/modules/authz/index.js';
import { resetDatabaseBeforeEach } from './database-fixture.js';
import upgrade from '../migrations/026_source_alias.up.js';
import { CatalogTreeResponse, catalogOpenApiDocument } from '../src/shared/api/catalog.js';

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
      await tx.query("INSERT INTO data_source(id,project_id,name,exposed_alias,kind,credential_ref) VALUES($1,$2,'Renamed Warehouse','original_warehouse','postgres','vault://test/catalog')",[id,project]);
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

  it('R-001: fetches exactly one level, uses stored exposed names and types, and scopes every branch', async () => {
    expect((await page()).nodes).toEqual([{kind:'source',id:sourceId,label:'original_warehouse',childCount:1,exposedType:null,state:null}]);
    const schemas = await page(`?parent=${sourceId}`); expect(schemas.nodes).toEqual([{kind:'schema',id:`${sourceId}:public`,label:'public',childCount:1,exposedType:null,state:null}]);
    expect((await page(`?parent=${schemas.nodes[0]!.id}`)).nodes[0]).toMatchObject({kind:'object',label:'stored_table',childCount:4});
    const elements = (await page(`?parent=${objectId}`)).nodes;
    expect(elements).toEqual(expect.arrayContaining([
      expect.objectContaining({label:'stored_number',exposedType:'INTEGER',state:'undecided'}),
      expect.objectContaining({label:'stored_text',exposedType:'VARCHAR',state:'undecided'}),
      expect.objectContaining({label:'stored_unsupported',exposedType:null,state:'unsupported'}),
      expect.objectContaining({label:null,exposedType:null,state:'unnameable'}),
    ]));
    expect(JSON.stringify(elements)).not.toContain('Source Number');
    expect((await page(`?parent=${objectId}&prefix=stored_n`)).nodes).toHaveLength(1);
    expect((await page(`?parent=${objectId}&prefix=stored%25`)).nodes).toEqual([]);
    expect((await page('?prefix=stored')).nodes).toEqual([]);
    expect((await get(`?parent=${otherSource}`)).status).toBe(404);
    expect((await get(`?parent=${otherSource}:public`)).status).toBe(404);
    expect((await get(`?parent=${objectId}`,otherProject)).status).toBe(404);
    allowed=false; expect((await get()).status).toBe(404);
  });

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

  it('paginates sources, schemas and objects without normalising stored names again', async () => {
    await withTenant(ctx, async tx => {
      await tx.query("INSERT INTO data_source(project_id,name,exposed_alias,kind,credential_ref) VALUES($1,'Second','second','postgres','vault://test/catalog')",[projectId]);
      await tx.query(`INSERT INTO catalog_object(source_id,project_id,schema_name,object_name,object_kind,exposed_schema,exposed_name)
        VALUES($1,$2,'Other','Order','table','z_schema','order_col'),($1,$2,'Source Schema','Other','view','public','other')`,[sourceId,projectId]);
    });
    for(const parent of ['',sourceId,`${sourceId}:public`]){
      const first=await page(`?parent=${parent}&limit=1`); const next=await page(`?parent=${parent}&limit=1&cursor=${first.nextCursor}`);
      expect(first.nodes).toHaveLength(1);expect(next.nodes).toHaveLength(1);expect(next.nodes[0]!.id).not.toBe(first.nodes[0]!.id);expect(next.nextCursor).toBeNull();
    }
    expect(catalogOpenApiDocument().paths['/api/v1/projects/{id}/catalog'].get.description).toContain('project#view');
  });

  it('assigns collision-safe aliases concurrently, refuses unnameable creation and guards renames', async () => {
    const repository=new PostgresSourceRegistrationRepository();
    const create=(name:string)=>repository.create(ctx,SourceId(randomUUID()),RunId(randomUUID()),{name,kind:'postgres',credentialRef:'vault://test/catalog',includeSchemas:[],samplingConsent:false,receivesLandings:false,landingStrategy:null},null);
    const results=await Promise.all(['Größe','Grosse','Grosse!'].map(create));expect(results.every(r=>r.ok)).toBe(true);
    expect(results.flatMap(r=>r.ok?[r.value.source.exposedAlias]:[]).sort()).toEqual(['grosse','grosse_2','grosse_3']);
    expect(await create('---')).toMatchObject({ok:false,error:{code:'validation_failed'}});
    await withTenant(ctx,tx=>tx.query("UPDATE data_source SET name='Display changed' WHERE id=$1",[sourceId]));
    expect((await page()).nodes.find(n=>n.id===sourceId)?.label).toBe('original_warehouse');
    await expect(withTenant(ctx,tx=>tx.query("UPDATE data_source SET exposed_alias='changed' WHERE id=$1",[sourceId]))).rejects.toMatchObject({code:'23514'});
  });
});

it('026 upgrades populated sources atomically, rejects all unnameable IDs, and runs down/up', async () => {
  const db=new Client({connectionString:process.env.TEST_DATABASE_URL});await db.connect();
  try {
    await db.query('BEGIN');const schema='alias_'+randomUUID().replaceAll('-','');await db.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public`);
    await db.query('CREATE TABLE data_source(id uuid PRIMARY KEY, project_id uuid,name text,created_at timestamptz); CREATE TABLE catalog_object(source_id uuid,duckdb_schema text,id uuid,status text); CREATE TABLE catalog_element(object_id uuid,id uuid,status text)');
    const invalid=[randomUUID(),randomUUID()];const project=randomUUID();
    for(const id of invalid)await db.query("INSERT INTO data_source VALUES($1,$2,'---',now())",[id,project]);
    await expect(upgrade(db)).rejects.toThrow(invalid[0]);await expect(upgrade(db)).rejects.toThrow(invalid[1]);
    expect((await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name='data_source' AND column_name='duckdb_alias'",[schema])).rows).toEqual([]);
    await db.query('DELETE FROM data_source');
    const names=['Größe','Grosse','Grosse!','select','123 Sales','a'.repeat(80),'a'.repeat(79)+'b'];
    for(const [index,name] of names.entries())await db.query('INSERT INTO data_source VALUES($1,$2,$3,to_timestamp($4))',[randomUUID(),project,name,index]);
    await upgrade(db);
    const naming=new CatalogNaming(new AsciiTransliterator());const reserved:ExposedName[]=[];
    const expected=names.map(name=>{const alias=naming.assign(name,reserved).name!;reserved.push(alias);return alias;});
    expect((await db.query('SELECT duckdb_alias FROM data_source ORDER BY created_at')).rows.map(r=>r.duckdb_alias)).toEqual(expected);
    await db.query(await readFile(new URL('../migrations/026_source_alias.down.sql',import.meta.url),'utf8'));await upgrade(db);
    expect((await db.query('SELECT count(*)::int AS n FROM data_source')).rows[0].n).toBe(names.length);
  } finally {await db.query('ROLLBACK');await db.end();}
},30_000);

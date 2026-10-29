import process from 'node:process';
import {readdirSync} from 'node:fs';
import pg from 'pg';
import {describe,it,expect,vi} from 'vitest';
import {gateDatabase} from '../scripts/gate-database.mjs';

const environment={DATABASE_URL:'postgresql://operator:private@localhost/opintel',TEST_DATABASE_URL:'postgresql://operator:private@localhost/opintel_test'};
function fixture(query=vi.fn().mockResolvedValue({rows:[]})){
 const client={on:vi.fn(),connect:vi.fn(),query,end:vi.fn()};
 const clientFactory=vi.fn(()=>client),migrateDatabase=vi.fn().mockResolvedValue(undefined);
 return {client,clientFactory,migrateDatabase};
}
describe('checkout gate database',()=>{
 it('creates from template0 with independent run identities and drops only its owned database',async()=>{
  const dependencies=fixture(),database=gateDatabase({environment,checkout:'/checkout/a',...dependencies});
  const other=gateDatabase({environment,checkout:'/checkout/a',...fixture()});
  expect(database.name).toMatch(/^opintel_test_gate_[a-f0-9]{12}_[a-f0-9]{12}$/u);
  expect(other.name).not.toBe(database.name);
  expect(other.name.slice(0,-12)).toBe(database.name.slice(0,-12));
  expect(gateDatabase({environment,checkout:'/checkout/b',...fixture()}).name.slice(0,-12)).not.toBe(database.name.slice(0,-12));
  await database.prepare();await database.close();await database.close();
  expect(dependencies.client.query.mock.calls).toEqual([[`CREATE DATABASE "${database.name}" TEMPLATE template0`],[`DROP DATABASE "${database.name}" WITH (FORCE)`]]);
  expect(new URL(dependencies.clientFactory.mock.calls[0][0].connectionString).pathname).toBe('/postgres');
  expect(dependencies.migrateDatabase).toHaveBeenCalledWith(database.url);
 });
 it('never drops an existing database when CREATE failed and does not expose credentials',async()=>{
  const dependencies=fixture(vi.fn().mockRejectedValue(Object.assign(new Error('private'),{code:'42501'})));
  const database=gateDatabase({environment,...dependencies});
  await expect(database.prepare()).rejects.toThrow('needs CREATEDB');await database.close();
  expect(dependencies.client.query).toHaveBeenCalledTimes(1);
  expect(dependencies.migrateDatabase).not.toHaveBeenCalled();
 });
 it('distinguishes stopped PostgreSQL and authentication from CREATEDB without native text',async()=>{
  for(const [code,message] of [['ECONNREFUSED','PostgreSQL is not running'],['28P01','PostgreSQL authentication failed'],['unknown','could not create']]){
   const dependencies=fixture(vi.fn().mockRejectedValue(Object.assign(new Error('private password'),{code}))),database=gateDatabase({environment,...dependencies});
   await expect(database.prepare()).rejects.toThrow(message);await database.close();
   expect(dependencies.client.query).toHaveBeenCalledTimes(1);
  }
 });
 it('retains ownership through migration failure so finally can remove the partial database',async()=>{
  const dependencies=fixture();dependencies.migrateDatabase.mockRejectedValue(new Error('private'));
  const database=gateDatabase({environment,...dependencies});
  try{await expect(database.prepare()).rejects.toThrow('migration failed');}finally{await database.close();}
  expect(dependencies.client.query.mock.calls.at(-1)).toEqual([`DROP DATABASE "${database.name}" WITH (FORCE)`]);
 });
 it('reports failed cleanup rather than recording a successful gate',async()=>{
  const dependencies=fixture(),database=gateDatabase({environment,...dependencies});await database.prepare();
  dependencies.client.query.mockRejectedValue(new Error('private'));
  await expect(database.close()).rejects.toThrow(`cleanup failed for owned gate database ${database.name}`);
 });
 it('rejects URL routing overrides before connecting',()=>{
  const dependencies=fixture();
  expect(()=>gateDatabase({environment:{TEST_DATABASE_URL:environment.TEST_DATABASE_URL+'?dbname=opintel'},...dependencies})).toThrow('routing overrides');
  expect(dependencies.clientFactory).not.toHaveBeenCalled();
 });
 it.runIf(process.env.REQUIRE_DB_TESTS==='1')('migrates a real empty database using only this checkout and removes it afterward',async()=>{
  const database=gateDatabase();
  const adminUrl=new URL(database.url);adminUrl.pathname='/postgres';
  const admin=new pg.Client({connectionString:adminUrl.toString()});await admin.connect();
  try{
   await database.prepare();
   const connection=new pg.Client({connectionString:database.url});await connection.connect();
   try{
    const result=await connection.query('SELECT version, name FROM schema_migration ORDER BY version');
    const expected=readdirSync('migrations').filter(name=>/\.up\.(sql|ts)$/u.test(name)).sort().map(name=>name.replace(/\.up\.(sql|ts)$/u,''));
    expect(result.rows.map(row=>row.version+'_'+row.name)).toEqual(expected);
    expect((await connection.query("SELECT datname FROM pg_database WHERE datname=$1",[database.name])).rowCount).toBe(1);
   }finally{await connection.end();}
   await database.close();
   expect((await admin.query('SELECT datname FROM pg_database WHERE datname=$1',[database.name])).rowCount).toBe(0);
  }finally{try{await database.close();}finally{await admin.end();}}
 });
});

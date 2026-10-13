import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import {assertTestDatabase,assertTestSpiceDb} from '../scripts/testing/datastore-safety.js';
for(const hostname of ['localhost','127.0.0.1','127.1.2.3','[::1]','localhost.']) {
 test('refuses dev targets via '+hostname,()=>{
  assert.throws(()=>assertTestDatabase(`postgres://u@${hostname}:5432/opintel`));
  assert.throws(()=>assertTestSpiceDb(`${hostname}:50051`));
 });
}
test('refuses query overrides and encoded dev database',()=>{
 for(const suffix of ['?host=localhost','?dbname=opintel','?database=opintel','?port=5432'])assert.throws(()=>assertTestDatabase('postgres://u@localhost/opintel_test'+suffix));
 assert.throws(()=>assertTestDatabase('postgres://u@localhost/%6fpintel'));
 assert.throws(()=>assertTestDatabase('postgres://u@127.0.0.1/foo_test','postgres://u@localhost/foo_test'));
});
test('hostname aliases cannot bypass either development fence',()=>{
 for(const name of ['spicedb','host.docker.internal','dev-alias.example','localhost.localdomain'])assert.throws(()=>assertTestSpiceDb(name+':50051'));
 assert.throws(()=>assertTestSpiceDb('dev-alias.example:52137'));
 assert.throws(()=>assertTestDatabase('postgres://u@dev-alias.example/custom_test','postgres://u@localhost/custom_test'));
 assert.throws(()=>assertTestDatabase('postgres://u@dev-alias.example/opintel'));
});
test('accepts dedicated normal and container datastores',()=>{
 assertTestDatabase('postgres://u@localhost:5432/opintel_test','postgres://u@localhost:5432/opintel');
 assertTestDatabase('postgres://u@172.30.84.10:5432/opintel_test');
 assertTestSpiceDb('localhost:52137');assertTestSpiceDb('172.30.84.12:50051');
});

test('accepts both normal and operator-preparation fixtures and exact test segments',()=>{
 for(const name of ['opintel_test','opintel_test_unused','test','test_fixture','fixture_test','fixture_test_more'])assert.doesNotThrow(()=>assertTestDatabase('postgres://u@localhost/'+name));
});
test('rejects substrings and development/production names even with a test segment',()=>{
 for(const name of ['opintel','contest','testing','fixturetest','opintel_dev','opintel_production','opintel_test_dev','production_test','test_prod','development_test'])assert.throws(()=>assertTestDatabase('postgres://u@localhost/'+name));
 assert.throws(()=>assertTestDatabase('postgres://u@127.0.0.1/opintel_test_unused','postgres://u@localhost/opintel_test_unused'));
});

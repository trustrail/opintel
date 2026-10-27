import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
const forbidden=/OPINTEL_(?:SECRET_DEMO_POSTGRES|SECRET_ACCEPTANCE_[A-Z_]+|[A-Z_]*TEST_[A-Z_]+|STAGE[0-9]_[A-Z_]+)|STAGE[0-9]_[A-Z_]+|TEST_DATABASE_URL|REQUIRE_DB_TESTS/u;
export function auditPackage(directory){
 function walk(root){for(const name of readdirSync(root)){const file=join(root,name),stat=lstatSync(file);if(stat.isSymbolicLink())throw new Error('Customer package contains an unexpected symlink.');if(stat.isDirectory()){walk(file);continue;}if(name==='images.tar')continue;if(stat.size>8*1024*1024)throw new Error('Unexpected customer package payload.');if(name==='package.env'&&/OPINTEL_XQ_REDEEM_URL/u.test(readFileSync(file,'utf8')))throw new Error('Customer package must default the redeem URL internally.');if(forbidden.test(readFileSync(file,'utf8')))throw new Error('Customer package contains a test-rig variable: '+file);}}
 walk(directory);
}

export function auditCustomerEnvironment(text){
 if(forbidden.test(text))throw new Error('Customer package environment contains a test-rig variable.');
 if(/OPINTEL_XQ_REDEEM_URL/u.test(text))throw new Error('Customer package must default the redeem URL internally.');
}

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sealResult} from '../../src/shared/infrastructure/sealed-result.js';
import {verifyCustodyCells} from './custody-check.js';
const receipt='10000000-0000-4000-8000-000000000001';
function fixture(){const sealed=sealResult([['synthetic-one'],['synthetic-two']],['risk_code'],[0],receipt);return {...sealed,output:{columns:[{name:'risk_code'}],rows:sealed.rows,evidenceId:receipt}};}
test('custody succeeds only when both shares decrypt to independent fixture values',()=>{const f=fixture();try{assert.deepEqual(verifyCustodyCells(f.output,['risk_code'],{risk_code:['synthetic-one','synthetic-two']},f.first,f.second),{matches:true,verified:2});assert.equal(verifyCustodyCells(f.output,['risk_code'],{risk_code:['wrong','wrong']},f.first,f.second).matches,false);}finally{f.first.fill(0);f.second.fill(0);}});
test('cleartext, corrupt ciphertext and changed receipt are not successful redemption',()=>{const f=fixture();try{const expected={risk_code:['synthetic-one','synthetic-two']};assert.equal(verifyCustodyCells({...f.output,rows:[['synthetic-one']]},['risk_code'],expected,f.first,f.second).matches,false);assert.equal(verifyCustodyCells({...f.output,evidenceId:'different'},['risk_code'],expected,f.first,f.second).matches,false);assert.equal(verifyCustodyCells({...f.output,rows:[['opintelsealed:v1:broken']]},['risk_code'],expected,f.first,f.second).matches,false);}finally{f.first.fill(0);f.second.fill(0);}});

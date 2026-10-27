import {it,expect} from 'vitest';
import {queryOutcomeBreach} from '../scripts/soak/query-breach.js';

const failed={isError:true,_meta:{code:'dependency_unavailable',cause:'release_prepare_failed',releaseFailure:{phase:'escrow',provider:'xq',providerFailure:{kind:'http_refused',status:400,subcall:'subscription',attempt:1}}}};
it('counts both retained incident shapes: retiring mismatch and exploratory escrow refusal',()=>{
 const breaches=[queryOutcomeBreach(failed,'Retiring credential outcome mismatch'),queryOutcomeBreach(failed)].filter(Boolean);
 expect(breaches).toEqual(['Escrow failed','Escrow failed']);
});
it('counts a declared escrow failure once even when the scenario expected the refusal',()=>{
 expect(queryOutcomeBreach(failed,'Declared scenario outcome mismatch')).toBe('Escrow failed');
 expect(queryOutcomeBreach(failed)).toBe('Escrow failed');
});
it('preserves other scenario mismatches and does not misclassify expected governance refusals',()=>{
 expect(queryOutcomeBreach({isError:true,_meta:{code:'element_withheld'}})).toBeUndefined();
 expect(queryOutcomeBreach({isError:true,_meta:{releaseFailure:{phase:'credential_association'}}})).toBeUndefined();
 expect(queryOutcomeBreach({isError:false})).toBeUndefined();
 expect(queryOutcomeBreach({isError:true},'Declared scenario outcome mismatch')).toBe('Declared scenario outcome mismatch');
});

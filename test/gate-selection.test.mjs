import {it,expect} from 'vitest';
import {gateSelection,gateTiers} from '../scripts/gate-selection.mjs';
it('keeps the full default gate and resumes all remaining tiers in order',()=>{
 expect(gateSelection([])).toEqual({scope:'full',scripts:gateTiers});
 expect(gateSelection(['--from','test:conformance'])).toEqual({scope:'resumed',from:'test:conformance',scripts:['test:conformance','test','test:smoke']});
 expect(gateSelection(['--from','test:smoke']).scripts).toEqual(['test:smoke']);
});
it('refuses unknown tiers and ambiguous arguments instead of silently skipping validation',()=>{
 for(const args of [['--from'],['test'],['--from','unknown'],['--from','test','--skip']])expect(()=>gateSelection(args)).toThrow('Usage: npm run check');
});

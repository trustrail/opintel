import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {controlPatterns,inspectControls} from './conformance/checker.js';
import {inspectMarkPlacement} from './conformance/mark-placement.js';
const css=readFileSync(new URL('../src/console-next/tokens.css',import.meta.url),'utf8')+readFileSync(new URL('../src/console-next/styles.css',import.meta.url),'utf8');
test('unclassified controls and broken disclosures fail; approved surfaces pass',async({page})=>{
 await page.setContent('<main id="console-next"><select><option>A</option></select><button>Raw</button><input type="range"></main>');
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toEqual(expect.arrayContaining(['Unclassified select control: no matching foundation control pattern.','Unclassified button control: no matching foundation control pattern.','Unclassified range control: no matching foundation control pattern.']));
 await page.setContent('<main id="console-next"><div data-shell><button aria-expanded="false" aria-controls="panel">More</button><div id="panel" hidden>Content</div></div></main><section data-dialog><label>Name<input></label><button role="checkbox" data-state="unchecked" aria-checked="false">Accept</button></section>');
 // A raw role does not qualify as the shared Checkbox pattern.
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toHaveLength(1);
 await page.locator('[role=checkbox]').evaluate(e=>{const label=document.createElement('label');label.setAttribute('data-check','');e.replaceWith(label);label.append(e);});
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('[aria-controls=panel]').evaluate(e=>e.setAttribute('aria-expanded','true'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure target visibility disagrees with aria-expanded.');
 await page.locator('#panel').evaluate(e=>e.removeAttribute('hidden'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('#panel').evaluate(e=>e.remove());
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure target does not exist.');
 await page.locator('[aria-controls=panel]').evaluate(e=>e.removeAttribute('aria-expanded'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure aria-expanded must be true or false.');
});
test('Radix closed portals may be unmounted; an open missing portal fails',async({page})=>{
 await page.setContent('<main id="console-next"><div data-shell><button data-select role="combobox" aria-haspopup="listbox" aria-expanded="false" aria-controls="options">Choose</button></div></main>');
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('button').evaluate(e=>e.setAttribute('aria-expanded','true'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure target does not exist.');
});
test('disabled and pending actions keep foundation states on hover',async({page})=>{
 await page.setContent(`<style>${css}</style><main id="console-next"><div data-shell><button disabled>Disabled</button><button disabled aria-busy="true">Saving…</button></div></main>`);
 for(const button of await page.locator('button').all()){await button.hover({force:true});expect(await button.evaluate(e=>({cursor:getComputedStyle(e).cursor,opacity:getComputedStyle(e).opacity}))).toEqual({cursor:'not-allowed',opacity:'0.5'});}
});
test('rule 14 validates each name and treatment, including multiple named chips in one receipt row',async({page})=>{
 const chip='<span data-kind-chip="column"><span data-kind="column" role="img" aria-label="column"><svg aria-hidden="true"></svg></span>Account</span>';
 await page.setContent(`<main id="console-next"><ul><li>${chip}${chip}<span data-treatment="tokenized" role="img" aria-label="Tokenized"><svg aria-hidden="true"></svg></span></li></ul></main>`);
 expect(await page.evaluate(inspectMarkPlacement)).toEqual([]);
 await page.locator('[data-kind]').first().evaluate(e=>e.removeAttribute('aria-label'));
 expect((await page.evaluate(inspectMarkPlacement)).map(f=>f.reason)).toContain('Kind mark must contain one passive SVG and a named kind.');
 await page.locator('[data-kind-chip]').last().evaluate(e=>e.querySelector('[data-kind]')?.remove());
 expect((await page.evaluate(inspectMarkPlacement)).map(f=>f.reason)).toContain('A named chip must carry exactly one kind mark.');
});
test('every application browser suite uses the observed fixture',async()=>{
 const {readdirSync}=await import('node:fs');
 for(const filename of readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.spec.ts')&&name!=='control-conformance.spec.ts'))expect(readFileSync(new URL(filename,import.meta.url),'utf8'),filename+' bypasses conformance').toMatch(/import\s*\{\s*test\s*\}\s*from\s*['"]\.\/fixtures\.js['"]/u);
});
test('Select has implicit listbox popup semantics; an ordinary closed disclosure still needs a target',async({page})=>{
 await page.setContent('<main id="console-next"><div data-shell><button data-select data-state="closed" role="combobox" aria-expanded="false">Choose</button></div></main>');
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('button').evaluate(e=>{e.removeAttribute('data-select');e.removeAttribute('role');});
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure has no aria-controls target.');
});

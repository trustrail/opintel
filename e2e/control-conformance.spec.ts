// Checker counterexamples deliberately use the base fixture: they must fail the
// checker, not the outer application fixture. No application screen uses this.
import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {controlPatterns,inspectControls} from './conformance/checker.js';
const master=readFileSync(new URL('../docs/opintel-master.css',import.meta.url),'utf8');
test('broken examples fail; ancestor patterns and disclosures pass',async({page})=>{
 await page.setContent(`<div id="opintel-app"><details class="card"><summary>Local resolution instructions</summary></details><div class="fld"><label for="bad">Destination industry</label><select id="bad"><option>General</option></select></div><button class="mono">Utility class is not a button pattern</button><input type="range" aria-label="Raw range"></div>`);
 const broken=await page.evaluate(inspectControls,controlPatterns);
 expect(broken.findings).toHaveLength(5);
 expect(broken.findings.map(f=>f.reason)).toEqual(expect.arrayContaining(['Unclassified select control: no matching master control pattern.','Unclassified button control: no matching master control pattern.','Unclassified range control: no matching master control pattern.']));
 await page.setContent(`<div id="opintel-app"><div class="fld"><label for="name">Name</label><input id="name"></div><input type="checkbox" aria-label="Enabled"><input type="radio" aria-label="Option"><select class="inp" aria-label="Industry"><option>General</option></select><div class="pick"><select aria-label="Pool"><option>Reporting</option></select></div><button class="toolchip" aria-expanded="false" aria-controls="panel">Migrate industry</button><div id="panel" hidden>Content</div></div>`);
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('button').evaluate(button=>button.setAttribute('aria-expanded','true'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toEqual(['Disclosure target visibility disagrees with aria-expanded.']);
 await page.locator('#panel').evaluate(panel=>panel.removeAttribute('hidden'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('button').evaluate(button=>button.removeAttribute('aria-expanded'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toContain('Disclosure aria-expanded must be true or false.');
 await page.locator('button').evaluate(button=>button.setAttribute('aria-expanded','true'));
 await page.locator('#panel').evaluate(panel=>panel.remove());
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toEqual(['Disclosure target does not exist.']);
});
test('approved disabled and busy styles defeat variant hover styles',async({page})=>{
 await page.setContent(`<style>${master}</style><div id="opintel-app">${['',' go',' ghost'].map(variant=>`<button class="btn${variant}" disabled>Disabled</button><button class="btn${variant}" disabled aria-busy="true">Saving…</button>`).join('')}<input type="checkbox" disabled><input type="radio" disabled></div>`);
 for(const button of await page.locator('button').all()){
  await button.hover({force:true});
  const styles=await button.evaluate(element=>{
   const actual=getComputedStyle(element),root=getComputedStyle(document.querySelector('#opintel-app')!);
   const busy=element.getAttribute('aria-busy')==='true';
   const probe=document.createElement('span');probe.style.color=root.getPropertyValue(busy?'--ink-2':'--ink-3');probe.style.background=root.getPropertyValue(busy?'--surface-3':'--surface-2');probe.style.borderColor=root.getPropertyValue('--rule-2');element.append(probe);const expected=getComputedStyle(probe);
   const result={actual:[actual.color,actual.backgroundColor,actual.borderColor,actual.cursor],expected:[expected.color,expected.backgroundColor,expected.borderColor,busy?'progress':'not-allowed']};probe.remove();return result;
  });expect(styles.actual).toEqual(styles.expected);
 }
 const expectedDisabledAccent=await page.locator('#opintel-app').evaluate(element=>{const probe=document.createElement('span');probe.style.color=getComputedStyle(element).getPropertyValue('--ink-3');element.append(probe);const result=getComputedStyle(probe).color;probe.remove();return result;});
 for(const input of await page.locator('input[type=checkbox],input[type=radio]').all()){
  const styles=await input.evaluate(element=>{const value=getComputedStyle(element);return {accent:value.accentColor,cursor:value.cursor,opacity:value.opacity};});
  expect(styles).toEqual({accent:expectedDisabledAccent,cursor:'not-allowed',opacity:'1'});
 }
});

test('every application browser suite uses the observed fixture',async()=>{
 const {readdirSync}=await import('node:fs');
 for(const filename of readdirSync(new URL('.',import.meta.url)).filter(name=>name.endsWith('.spec.ts')&&name!=='control-conformance.spec.ts')){
  const source=readFileSync(new URL(filename,import.meta.url),'utf8');
  expect(source,`${filename} bypasses the control-conformance fixture`).toMatch(/import\s*\{\s*test\s*\}\s*from\s*['"]\.\/fixtures\.js['"]/u);
 }
});

test('compact drawer is checked by its master state, not whole-drawer visibility',async({page})=>{
 await page.setContent('<div id="opintel-app"><div class="shell collapsed"><aside class="drawer" id="drawer"><button class="dtoggle" aria-controls="drawer" aria-expanded="false">Expand menu</button></aside></div></div>');
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
 await page.locator('.dtoggle').evaluate(button=>button.setAttribute('aria-expanded','true'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings.map(f=>f.reason)).toEqual(['Compact drawer state disagrees with aria-expanded.']);
 await page.locator('.shell').evaluate(shell=>shell.classList.remove('collapsed'));
 expect((await page.evaluate(inspectControls,controlPatterns)).findings).toEqual([]);
});

test('VIS-003/VIS-005: placement counts rows and knows uniform scope beyond a rendered window',async({page})=>{
 const {inspectMarkPlacement}=await import('./conformance/mark-placement.js');
 const mark=(name:string,category:string)=>`<svg aria-hidden="true" focusable="false" data-mark="${name}" data-mark-category="${category}"><circle cx="8" cy="8" r="5"/></svg>`;
 await page.setContent(`<div id="opintel-app"><div data-mark-list="uniform" role="tree"><div data-mark-row data-row-kind="element" role="treeitem">${mark('treatment-clear','treatment')}</div></div><ul data-mark-list="mixed"><li data-mark-row data-row-kind="source">${mark('source','kind')}<ul data-mark-list="uniform"><li data-mark-row data-row-kind="element">${mark('treatment-tokenized','treatment')}</li></ul></li></ul><nav data-mark-navigation><ul data-mark-list="uniform"><li data-mark-row data-row-kind="navigation">${mark('nav-pools','kind')}</li></ul></nav><svg aria-hidden="true"><path d="M0 0h1"/></svg><button class="toolchip"><svg aria-hidden="true"><path d="m0 0 1 1"/></svg>Expand</button></div>`);
 expect(await page.evaluate(inspectMarkPlacement)).toEqual([]);
 await page.setContent(`<div id="opintel-app"><div data-mark-list="uniform" role="tree"><div data-mark-row data-row-kind="element" role="treeitem">${mark('element','kind')}</div></div><ul data-mark-list="mixed"><li data-mark-row data-row-kind="query">${mark('query','kind')}${mark('refused','state')}</li></ul><h1>${mark('nav-activity','kind')}Activity</h1><section class="blank">${mark('source','kind')}Data sources</section></div>`);
 const reasons=(await page.evaluate(inspectMarkPlacement)).map(f=>f.reason);
 expect(reasons).toHaveLength(4);
 expect(reasons).toContain('Uniform list carries a kind mark.');
 expect(reasons).toContain('Row carries more than one identity mark.');
 expect(reasons.filter(r=>r==='Kind mark repeats a heading or empty state identity.')).toHaveLength(2);
 await page.setContent(`<div id="opintel-app"><ul data-mark-list="mixed"><li data-mark-row>${mark('source','kind')}</li></ul></div>`);
 expect((await page.evaluate(inspectMarkPlacement)).map(f=>f.reason)).toEqual(['Row kind is missing; scope cannot be checked independently of marks.']);
 await page.setContent('<div id="opintel-app"><nav data-mark-navigation><button class="btn">Sources</button></nav></div>');
 expect((await page.evaluate(inspectMarkPlacement)).map(f=>f.reason)).toEqual(['Navigation destination must carry exactly one identity mark.']);
});

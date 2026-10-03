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

import {readFileSync} from 'node:fs';
import {expect,type BrowserContext,type TestInfo} from '@playwright/test';
import {controlPatterns,inspectControls,type Scan} from './checker.js';

const master=readFileSync(new URL('../../docs/opintel-master.css',import.meta.url),'utf8');
export async function observeConformance(context:BrowserContext,testInfo:TestInfo){
 const scans=new Map<string,Scan>();
 const findings=new Map<string,Scan['findings'][number]>();
 const receive=(scan:Scan)=>{
  if(!scan.heading&&!scan.controls)return;
  scans.set(JSON.stringify([scan.screen,scan.heading,scan.states]),scan);
  for(const finding of scan.findings)findings.set(JSON.stringify(finding),finding);
 };
 await context.exposeBinding('__reportControlConformance',(_source,scan:Scan)=>receive(scan));
 await context.addInitScript({content:`(() => {
  const inspect = ${inspectControls.toString()};
  const patterns = ${JSON.stringify(controlPatterns)};
  const sheet = new CSSStyleSheet(); sheet.replaceSync(${JSON.stringify(master)});
  const selectors = new Set();
  const normalize = s => s.replace(/['"]/g, '').replace(/\\s+/g,' ').trim();
  const walk = rules => { for (const rule of rules) {
    if (rule.selectorText) for (const selector of rule.selectorText.split(',')) selectors.add(normalize(selector));
    if (rule.cssRules) walk(rule.cssRules);
  }}; walk(sheet.cssRules);
  const missing = patterns.filter(p => !selectors.has(normalize(p.master)));
  let contentPath = location.pathname, contentHeading = null;
  const scan = () => {
    const result=inspect(patterns);
    // History updates before React replaces the outgoing page. Attribute its
    // controls to the content still mounted, not the destination URL.
    if (result.heading && result.heading !== contentHeading) {
      contentPath=location.pathname; contentHeading=result.heading;
    }
    result.screen=contentPath;
    result.findings=result.findings.map(f => ({...f,screen:contentPath}));
    for (const p of missing) result.findings.push({screen:location.pathname,name:p.selector,markup:p.master,reason:'Pattern selector is absent from master stylesheet.'});
    return window.__reportControlConformance(result);
  };
  window.__scanControlConformance=scan;
  // MutationObserver runs after each committed DOM change, including transient
  // loading/pending states and panels later removed or pages later closed.
  new MutationObserver(() => { void scan(); }).observe(document,{subtree:true,childList:true,attributes:true,characterData:true});
  document.addEventListener('DOMContentLoaded',()=>{void scan();});
})();`});
 return async()=>{
  for(const page of context.pages())if(!page.isClosed())await page.evaluate(async()=>{
   const scan=(window as Window & {__scanControlConformance?:()=>Promise<void>}).__scanControlConformance;
   if(document.querySelector('#opintel-app')&&!scan)throw new Error('Control conformance observer did not initialize.');
   await scan?.();
  });
  const result={test:testInfo.titlePath,scans:[...scans.values()].map(({findings:_findings,...scan})=>scan),findings:[...findings.values()]};
  await testInfo.attach('control-conformance',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.findings,'Unclassified controls or broken disclosure contracts; see control-conformance attachment').toEqual([]);
 };
}

import {inspectMarkPlacement} from './conformance/mark-placement.js';
import {observeConformance} from './conformance/fixture.js';
import {test as base,expect} from '@playwright/test';

/** Enforce the screen navigation contract across every browser-test state. */
export const test=base.extend<{screenNavigationContract:void;controlConformance:void;visualClock:void;markPlacement:void}>({
 markPlacement:[async({context},use,testInfo)=>{
  const findings=new Set<string>();
  // Conformance observes every committed state; other suites check final markup.
  if(testInfo.project.metadata.controlConformance===true){
   await context.exposeBinding('__reportMarkPlacement',(_source,items:ReturnType<typeof inspectMarkPlacement>)=>{for(const item of items)findings.add(JSON.stringify(item));});
   await context.addInitScript({content:`(() => {
    const inspect=${inspectMarkPlacement.toString()};
    const scan=()=>window.__reportMarkPlacement(inspect());
    new MutationObserver(()=>{void scan();}).observe(document,{subtree:true,childList:true,attributes:true});
    document.addEventListener('DOMContentLoaded',()=>{void scan();});
   })();`});
  }
  await use();
  for(const page of context.pages())if(!page.isClosed())for(const item of await page.evaluate(inspectMarkPlacement))findings.add(JSON.stringify(item));
  await testInfo.attach('mark-placement',{body:JSON.stringify([...findings].map(item=>JSON.parse(item)),null,2),contentType:'application/json'});
  expect([...findings],'Visual identity placement').toEqual([]);
 },{auto:true}],
 visualClock:[async({page},use,testInfo)=>{
  // Relative age must not change when these committed snapshots run later.
  // Playwright's clock belongs to the context, including newly opened pages.
  // setFixedTime fixes Date only; polling and rendering timers still run.
  if(testInfo.tags.includes('@visual'))await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));
  await use();
 },{auto:true}],
 controlConformance:[async({context},use,testInfo)=>{
  if(testInfo.project.metadata.controlConformance!==true){await use();return;}
  const finish=await observeConformance(context,testInfo);await use();await finish();
 },{auto:true}],
 screenNavigationContract:[async({context},use)=>{
  await use();
  for(const page of context.pages()){
   const outsideBreadcrumb=page.locator(':not(nav[aria-label="Breadcrumb"] *)');
   const name=/^(back|back to |. back)/i;
   await expect(page.getByRole('link',{name}).and(outsideBreadcrumb)).toHaveCount(0);
   await expect(page.getByRole('button',{name}).and(outsideBreadcrumb)).toHaveCount(0);
  }
 },{auto:true}],
});

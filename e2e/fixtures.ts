import {observeConformance} from './conformance/fixture.js';
import {test as base,expect} from '@playwright/test';

/** Enforce the screen navigation contract across every browser-test state. */
export const test=base.extend<{screenNavigationContract:void;controlConformance:void}>({
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

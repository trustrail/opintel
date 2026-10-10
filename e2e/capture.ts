import {expect,type Page,type TestInfo} from '@playwright/test';

/** Preconditions shared by every committed page snapshot. */
export async function prepareCapture(page:Page,info:TestInfo,name:string){
 await page.mouse.move(0,0);
 await page.evaluate(()=>document.fonts.ready);
 await page.waitForFunction(()=>document.getAnimations().length===0);
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.waitForFunction(()=>window.scrollY===0);
 const metadata=await page.evaluate(()=>({
  mouse:{x:0,y:0},fonts:document.fonts.status,
  animations:document.getAnimations().length,scrollY:window.scrollY,
  url:location.href,viewport:{width:innerWidth,height:innerHeight},
 }));
 await info.attach('capture-'+name,{body:JSON.stringify(metadata,null,2),contentType:'application/json'});
 expect(metadata.fonts).toBe('loaded');
 expect(metadata.animations).toBe(0);
 expect(metadata.scrollY).toBe(0);
 return metadata;
}

export async function capture(page:Page,info:TestInfo,name:string,options:{fullPage?:boolean;animations?:'disabled'|'allow'}={fullPage:true}){
 await prepareCapture(page,info,name);
 await expect(page).toHaveScreenshot(name,options);
}

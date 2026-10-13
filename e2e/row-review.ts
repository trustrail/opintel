import {mkdir,writeFile} from 'node:fs/promises';
import type {Page,TestInfo} from '@playwright/test';
import {prepareCapture} from './capture.js';
/** Review artifacts only: never compares or writes a committed baseline. */
export async function rowReview(page:Page,info:TestInfo,state:string,width:number){
 const path=`tmp/review/row-2b-${state}-${width}`;
 await mkdir('tmp/review',{recursive:true});
 const metadata=await prepareCapture(page,info,state);
 await page.screenshot({path:path+'.png',fullPage:true});
 const controls=await page.locator('[data-part="predicate-row"] .inp,[data-part="predicate-row"] .sel').evaluateAll(elements=>elements.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {tag:el.tagName,x:r.x,y:r.y,width:r.width,height:r.height,padding:s.padding,fontSize:s.fontSize,fontWeight:s.fontWeight,labelledBy:el.getAttribute('aria-labelledby'),backgroundPosition:s.backgroundPosition};}));
 await writeFile(path+'.json',JSON.stringify({...metadata,controls},null,2));
}

import {expect,type Page,type TestInfo} from '@playwright/test';
import {waitForActivityData} from './capture-readiness.js';

/** Preconditions shared by every committed page snapshot. */
export async function prepareCapture(page:Page,info:TestInfo,name:string){
 const initialActivityData=await waitForActivityData(page);
 await page.mouse.move(0,0);
 await page.evaluate(()=>document.fonts.ready);
 const pausedAnimations=await page.evaluate(async()=>{
  const paused=new Set<Animation>();
  // Finishing an entrance can start another finite animation. Recheck the
  // document after each batch rather than only waiting for the first batch.
  for(;;){
   const finite:Animation[]=[];
   for(const animation of document.getAnimations()){
    if(animation.effect?.getTiming().iterations===Infinity){
     animation.pause();
     animation.currentTime=0;
     paused.add(animation);
    }else if(animation.playState!=='finished'&&animation.playState!=='idle'){
     finite.push(animation);
    }
   }
   if(finite.length===0)return paused.size;
   // Cancellation also means the animation no longer needs to finish.
   await Promise.all(finite.map(animation=>animation.finished.catch(()=>undefined)));
  }
 });
 await page.evaluate(()=>window.scrollTo(0,0));
 await page.waitForFunction(()=>window.scrollY===0);
 const settledActivityData=await waitForActivityData(page);
 const activityData=settledActivityData?{...settledActivityData,pendingAtStart:initialActivityData?.pendingAtStart??[]}:null;
 // State transitions can leave different retained glyph paint despite identical
 // text, geometry and settled fonts. Invalidate paint without changing layout or
 // yielding a hidden frame, then let the restored page paint before capture.
 const focusPreserved=await page.evaluate(async()=>{
  const root=document.documentElement,active=document.activeElement;
  const visibility=root.style.getPropertyValue('visibility'),priority=root.style.getPropertyPriority('visibility');
  try{
   root.style.setProperty('visibility','hidden','important');
   getComputedStyle(root).visibility;
  }finally{
   if(visibility)root.style.setProperty('visibility',visibility,priority);
   else root.style.removeProperty('visibility');
  }
  await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  return document.activeElement===active;
 });
 expect(focusPreserved).toBe(true);
 const metadata=await page.evaluate(()=>({
  mouse:{x:0,y:0},fonts:document.fonts.status,
  animations:document.getAnimations().length,
  finiteAnimations:document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity&&animation.playState!=='finished'&&animation.playState!=='idle').length,
  scrollY:window.scrollY,
  url:location.href,viewport:{width:innerWidth,height:innerHeight},text:document.body.innerText,
 }));
 const captureMetadata={...metadata,pausedAnimations,activityData,freshPaint:true,focusPreserved};
 await info.attach('capture-'+name,{body:JSON.stringify(captureMetadata,null,2),contentType:'application/json'});
 expect(metadata.fonts).toBe('loaded');
 expect(metadata.finiteAnimations).toBe(0);
 expect(metadata.scrollY).toBe(0);
 return captureMetadata;
}

export async function capture(page:Page,info:TestInfo,name:string,options:{fullPage?:boolean;animations?:'disabled'|'allow'}={fullPage:true}){
 await prepareCapture(page,info,name);
 await expect(page).toHaveScreenshot(name,options);
}

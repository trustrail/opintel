import {expect,type Page,type TestInfo} from '@playwright/test';

/** Preconditions shared by every committed page snapshot. */
export async function prepareCapture(page:Page,info:TestInfo,name:string){
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
 const metadata=await page.evaluate(()=>({
  mouse:{x:0,y:0},fonts:document.fonts.status,
  animations:document.getAnimations().length,
  finiteAnimations:document.getAnimations().filter(animation=>animation.effect?.getTiming().iterations!==Infinity&&animation.playState!=='finished'&&animation.playState!=='idle').length,
  scrollY:window.scrollY,
  url:location.href,viewport:{width:innerWidth,height:innerHeight},
 }));
 const captureMetadata={...metadata,pausedAnimations};
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

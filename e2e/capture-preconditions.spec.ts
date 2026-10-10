import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {prepareCapture} from './capture.js';

test('capture waits for finite motion and freezes infinite motion',async({page})=>{
 await page.setContent('<div id="finite">Finite</div><div id="infinite">Infinite</div>');
 await page.evaluate(()=>{
  document.querySelector('#finite')!.animate([{opacity:0},{opacity:1}],{duration:100,fill:'forwards'});
  document.querySelector('#infinite')!.animate([{opacity:0},{opacity:1}],{duration:1000,iterations:Infinity});
 });
 const metadata=await prepareCapture(page,test.info(),'animation-preconditions');
 expect(metadata.pausedAnimations).toBe(1);
 expect(metadata.finiteAnimations).toBe(0);
 expect(await page.evaluate(()=>document.getAnimations().map(animation=>({state:animation.playState,time:animation.currentTime,iterations:animation.effect?.getTiming().iterations}))))
  .toEqual(expect.arrayContaining([{state:'paused',time:0,iterations:Infinity},{state:'finished',time:100,iterations:1}]));
});

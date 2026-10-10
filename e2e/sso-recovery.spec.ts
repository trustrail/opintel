import {capture} from './capture.js';
import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import axe from 'axe-core';

for(const width of [390,900,1440])test(`5.19 administrator recovery at ${width}`,{tag:'@visual'},async({page})=>{
 await page.setViewportSize({width,height:1000});
 await page.route('**/api/v1/auth/providers*',route=>route.fulfill({json:{magicLink:true,providers:[{provider:'oidc:company',displayName:'Company SSO',startPath:'/auth/oidc/oidc:company/start'}],enforced:'oidc:company'}}));
 await page.route('**/api/v1/auth/me',route=>route.fulfill({status:401,json:{error:{code:'unauthenticated',message:'Sign in is required.',requestId:'test',retryable:false}}}));
 await page.goto('/sign-in');
 await page.getByLabel('Email address').fill('person@example.com');
 await expect(page.getByRole('button',{name:'Request administrator recovery link'})).toBeEnabled();
 await expect(page.getByRole('button',{name:'Continue with Company SSO'})).toBeVisible();
 await expect(page).toHaveURL(/\/sign-in$/u);
 await expect(page.getByText(/Only company administrators can receive a recovery link; every use is audited/)).toBeVisible();
 await page.addScriptTag({content:axe.source});
 expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await capture(page,test.info(),`sso-recovery-${width}.png`,{fullPage:true});
});

test('magic-link request acknowledges in place, blocks pending duplicates and permits a deliberate retry',async({page})=>{
 await page.route('**/api/v1/auth/providers*',route=>route.fulfill({json:{magicLink:true,providers:[],enforced:null}}));
 await page.goto('/sign-in');await page.getByLabel('Email address').fill('person@example.com');await expect(page.getByRole('button',{name:'Continue with email'})).toBeEnabled();
 let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/auth/request-link',async route=>{calls++;await gate;await route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Mail delivery could not be confirmed. Request another link.',requestId:'mail',retryable:true}}});});
 try{await page.getByRole('button',{name:'Continue with email'}).dblclick();await expect(page.getByRole('button',{name:'Sending link…'})).toBeDisabled();expect(calls).toBe(1);release();
 await expect(page.locator('form').getByRole('alert')).toHaveText('Mail delivery could not be confirmed. Request another link.');await page.getByRole('button',{name:'Continue with email'}).click();await expect.poll(()=>calls).toBe(2);}finally{release();}
});

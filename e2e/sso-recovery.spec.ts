import {test,expect} from '@playwright/test';
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
 await expect(page).toHaveScreenshot(`sso-recovery-${width}.png`,{fullPage:true});
});

import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {navGroups} from '../src/app/navigation.js';
import {mockDashboard,project} from './dashboard-fixture.js';
// Concrete feature screens are exercised by their existing full browser suites.
// Also visit every retained placeholder/legacy drawer route, not just features.
for(const item of navGroups.flatMap(group=>group.items).filter(item=>item.path!=='/projects'&&item.path!=='/settings')){
 test(`control coverage: legacy ${item.path}`,async({page})=>{
  await mockDashboard(page);await page.goto(item.path);await expect(page.locator('#opintel-app h1')).toBeVisible();
 });
}
for(const screen of ['releases','workbench','vocabulary','source-of-truth','relationships','knowledge','audit-log']){
 test(`control coverage: project ${screen}`,async({page})=>{
  await mockDashboard(page);await page.goto(`/projects/${project}/${screen}`);await expect(page.locator('#opintel-app h1')).toBeVisible();
 });
}
test('control coverage: check-email, callback refusal, confirmation and pending work',async({page})=>{
 await page.route('**/api/v1/auth/**',async route=>{
  if(route.request().url().includes('/providers'))return route.fulfill({json:{magicLink:true,providers:[],enforced:null}});
  if(route.request().url().includes('/request-link'))return route.fulfill({status:204});
  return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Sign-in unavailable. Request a new link.',requestId:'conformance',retryable:true}}});
 });
 await page.goto('/sign-in');await page.getByLabel('Email address').fill('person@example.com');await page.getByRole('button',{name:'Continue with email',exact:true}).click();await expect(page.getByRole('heading',{name:'Check your email'})).toBeVisible();
 await page.goto('/auth/callback?token=example');await expect(page.getByRole('button',{name:'Try again'})).toBeVisible();
 await page.goto('/auth/confirm-device?token=example');await expect(page.getByRole('button',{name:/confirm/i})).toBeVisible();
});

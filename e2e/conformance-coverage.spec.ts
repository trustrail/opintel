import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {screenPaths} from './conformance/screens.js';
import {mockConsole,project,pool} from './console-fixture.js';
for(const pattern of screenPaths())test(`conformance: ${pattern}`,async({page})=>{
 await mockConsole(page);const u=new URL(pattern,'http://console.invalid');
 if(u.pathname==='/'){u.searchParams.set('project',project);if(u.searchParams.get('screen')==='pools')u.searchParams.set('pool',pool);}
 if(u.pathname.startsWith('/auth/'))u.searchParams.set('token','conformance');
 await page.goto(u.pathname+u.search);
 if(u.pathname==='/auth/callback')await expect(page.getByRole('heading',{name:'We could not sign you in'})).toBeVisible();
 else if(u.pathname.startsWith('/auth/')||u.pathname==='/sign-in'||u.pathname==='/check-email')await expect(page.locator('[data-auth-content] h2')).toBeVisible();
 else if(u.searchParams.has('dialog'))await expect(page.getByRole('dialog')).toBeVisible();
 else await expect(page.locator('[role=heading],h1').first()).toBeVisible();
 await page.waitForLoadState('networkidle');
});
test('Welcome has the same observed controls with no project',async({page})=>{await mockConsole(page,{welcome:true});await page.goto('/');await expect(page.getByRole('heading',{name:/Let agents read your data/})).toBeVisible();await page.waitForLoadState('networkidle');});
test('phone Needs-you expands the trailing rows in place',async({page})=>{
 await mockConsole(page);await page.setViewportSize({width:390,height:900});await page.goto('/?screen=home&project='+project);
 await expect(page.locator('[data-needs-row]:visible')).toHaveCount(5);
 await page.getByRole('button',{name:'3 more',exact:true}).click();await expect(page.locator('[data-needs-row]:visible')).toHaveCount(8);
 await page.getByRole('button',{name:'Show fewer',exact:true}).click();await expect(page.locator('[data-needs-row]:visible')).toHaveCount(5);
});

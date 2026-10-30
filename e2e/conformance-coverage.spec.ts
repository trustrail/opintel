import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {screenPaths} from './conformance/screens.js';
import {mockDashboard,project,source} from './dashboard-fixture.js';
import {mockPools,pool} from './pools-fixture.js';
import {mockActivity,entry} from './activity-fixture.js';
import {fixture as settings} from './settings-fixture.js';
import {mock as catalog} from './catalog-fixture.js';
import {mock as entitlements} from './entitlements-fixture.js';

// Only the visits change. The existing control, disclosure, navigation and mark
// observers and the router-derived coverage reporter retain their assertions.
for(const pattern of screenPaths())test(`conformance: ${pattern}`,async({page})=>{
 await mockDashboard(page);
 if(pattern.includes('/pools'))await mockPools(page);
 else if(pattern.includes('/activity')||pattern.includes('/runs/'))await mockActivity(page);
 else if(pattern.includes('settings')||pattern.endsWith('/new'))await settings(page);
 else if(pattern.endsWith('/catalog'))await catalog(page);
 else if(pattern.endsWith('/entitlements'))await entitlements(page);
 await page.route('**/api/v1/auth/providers*',route=>route.fulfill({json:{magicLink:true,providers:[],enforced:null}}));
 await page.route('**/api/v1/auth/callback',route=>route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Sign-in unavailable. Request a new link.',requestId:'conformance',retryable:true}}}));
 const path=pattern.replace('$projectId',project).replace('$companyId',source).replace('$poolId',pool).replace('$sourceId',source).replace('$runId',entry.id).replace('$agentId','reporter');
 const query=pattern.endsWith('/catalog')||pattern.endsWith('/data-sources')||pattern.includes('/introspections')?'?advanced=true':pattern.includes('/runs/')?`?startedAt=${encodeURIComponent(entry.startedAt)}`:pattern.includes('/auth/')?'?token=conformance':'';
 await page.goto('/legacy'+path+query);
 if(pattern==='/auth/callback'){
  const app=page.locator('#console-next');
  await expect(app.getByText('We could not sign you in',{exact:true})).toBeVisible();
  await expect(app.getByText('Sign-in unavailable. Request a new link.',{exact:true})).toBeVisible();
  await expect(app.getByRole('button',{name:'Request a new link',exact:true})).toBeVisible();
 }else if(['/sign-in','/check-email','/auth/confirm-device'].includes(pattern))await expect(page.locator('#console-next [data-auth-content] h2')).toBeVisible();else await expect(page.locator('#opintel-app h1')).toBeVisible();
 // Let all outstanding fixture responses commit before the final observer scan.
 await page.waitForLoadState('networkidle');
});

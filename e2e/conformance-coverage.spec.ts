import {test} from './fixtures.js';
import {expect} from '@playwright/test';
import {screenPaths} from './conformance/screens.js';
import {mockConsole,project,pool,object,credential,at} from './console-fixture.js';
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


for(const combine of ['and','or'] as const)test(`compound per-table ${combine} preserves mixed numeric/date controls and request`,async({page})=>{
 await mockConsole(page);
 await page.route('**/api/v1/projects/*/catalog?*',route=>route.fulfill({json:{nodes:[{kind:'element',id:project,label:'claim_amount',childCount:null,exposedType:'DECIMAL(18,2)',state:null},{kind:'element',id:credential,label:'loss_date',childCount:null,exposedType:'DATE',state:null}],nextCursor:null}}));
 await page.route(`**/api/v1/pools/*/row-entitlements/${object}?*`,route=>route.fulfill({json:{objectId:object,objectName:'records',poolId:pool,scoped:true,columns:[{id:project,name:'claim_amount',sourceIdentifier:'claim_amount',type:'DECIMAL(18,2)'},{id:credential,name:'loss_date',sourceIdentifier:'loss_date',type:'DATE'}],current:{id:credential,expression:'"claim_amount" > 1000',hash:'stored',actorId:project,decidedAt:at,firstScoping:true}}}));
 let saved:unknown;
 await page.route('**/api/v1/pools/*/tables/*/rows',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{objectId:object,sourceId:project,name:'records',needsRows:false,reason:null}});});
 await page.goto(`/?project=${project}&screen=pools&pool=${pool}&tab=access`);await page.getByRole('button',{name:'Set rows',exact:true}).click();
 const select=async(label:string,name:string|RegExp)=>{await page.getByRole('combobox',{name:label,exact:true}).click();await page.getByRole('option',{name,exact:typeof name==='string'}).click();};
 await expect(page.getByText('Saving replaces the current rule: \"claim_amount\" > 1000',{exact:true})).toBeVisible();await expect(page.getByLabel('Row rule value',{exact:true})).toHaveValue('1000');
 await page.getByRole('button',{name:'Add condition',exact:true}).click();
 await select('Row rule column 2',/^loss_date ·/);await select('Row rule operator 2','<=');await page.getByLabel('Row rule value 2',{exact:true}).fill('2026-11-01');
 if(combine==='or')await select('Combine conditions',/^OR/);
 await page.getByLabel('Row rule value',{exact:true}).fill('1001');await page.getByLabel('Row rule value',{exact:true}).fill('1000');
 await expect(page.getByRole('combobox',{name:'Row rule column',exact:true})).toContainText('claim_amount');await expect(page.getByLabel('Row rule value',{exact:true})).toHaveValue('1000');
 const apply=page.getByRole('button',{name:'Apply',exact:true});await expect(apply).toBeEnabled();
 expect(await apply.evaluate(button=>(button.closest('form') as HTMLFormElement).checkValidity())).toBe(true);
 await apply.click();await expect(page.locator('[data-inline-rows]')).toHaveCount(0);
 expect(saved).toEqual({projectId:project,rowRule:{combine,conditions:[{column:'claim_amount',operator:'>',value:1000},{column:'loss_date',operator:'<=',value:'2026-11-01'}]}});
});

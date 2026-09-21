import { test,expect,type Page } from '@playwright/test';
import axe from 'axe-core';
const project='018f8f9d-7f83-7abc-8def-000000000001';const source='018f8f9d-7f83-7abc-8def-000000000002';const id='018f8f9d-7f83-7abc-8def-000000000003';
const run={id,sourceId:source,state:'complete',progress:{objects:3,total:null},error:null as string|null,startedAt:'2026-09-20T10:00:00Z',endedAt:'2026-09-20T10:00:04Z',diff:[
 {change:'type_changed',elementId:id,duckdbName:'written_amount',before:'integer',after:'varchar',breaking:true},
 {change:'type_changed',elementId:id,duckdbName:'description',before:'varchar(50)',after:'varchar(100)',breaking:false},
 {change:'renamed',elementId:id,duckdbName:'original_name',before:'Original Name',after:'New Name',breaking:false},
 {change:'removed',elementId:id,duckdbName:'retired_field',before:null,after:null,breaking:false},
 {change:'added',elementId:id,duckdbName:'new_field',before:null,after:null,breaking:false},
]};
async function mock(page:Page){const state={run:structuredClone(run),error:false,loading:false,empty:false,requests:0,cancels:0,role:'admin',cursor:false};
 await page.route('**/api/v1/**',async route=>{const url=new URL(route.request().url());const path=url.pathname;
 if(path.endsWith('/auth/me'))return route.fulfill({json:{id,email:'admin@example.com',fullName:'Admin',timezone:'UTC',method:'magic_link',sessionCreatedAt:'2026-01-01T00:00:00.000Z',deviceConfirmed:true}});
 if(path.endsWith('/projects'))return route.fulfill({json:{items:[{id:project,name:'Reporting',company:{id,name:'Example Company'},industry:{id,name:'General'},region:'eu-west-1',role:state.role}],nextCursor:null}});
 if(path.endsWith('/sources'))return route.fulfill({json:{items:[],nextCursor:null}});
 if(path.endsWith('/cancel')){state.cancels++;state.run.state='cancelled';return route.fulfill({json:{...state.run,diff:null}});}
 if(path.includes('/introspections')){state.requests++;if(state.loading)await new Promise(resolve=>setTimeout(resolve,700));if(state.error)return route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'The run register is temporarily unavailable.',requestId:'test',retryable:true}}});
 if(path.endsWith('/introspections')){state.cursor=!!url.searchParams.get('cursor');return route.fulfill({json:{items:state.empty?[]:[state.cursor?{...state.run,id:'018f8f9d-7f83-7abc-8def-000000000004'}:state.run],nextCursor:state.empty||state.cursor?null:'next-page'}});}
 return route.fulfill({json:{...state.run,diff:state.run.state==='complete'?state.run.diff:null}});}
 return route.fulfill({status:404,json:{}});
 });return state;
}
const path=`/projects/${project}/introspections/${id}`;
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>v.id))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test.use({reducedMotion:'reduce'});
for(const width of [390,900,1440])test(`G-003 to G-009: run diff and history at ${width}`,async({page})=>{
 await mock(page);await page.setViewportSize({width,height:1000});await page.goto(path);
 await expect(page.getByText('Reverts to undecided',{exact:true})).toBeVisible();await expect(page.getByText('Breaking change',{exact:true})).toHaveCount(1);
 await expect(page.getByRole('row').filter({hasText:'description'})).toContainText('Decision retained.');
 await expect(page.getByRole('row').filter({hasText:'original_name'})).toContainText('Identity and decision retained.');
 await expect(page.getByRole('row').filter({hasText:'retired_field'})).toContainText('Decision retained, inactive.');
 await expect(page.getByRole('row').filter({hasText:'new_field'})).toContainText('Needs a decision');
 await expect(page.getByRole('button',{name:'Cancel introspection'})).toHaveCount(0);
 await expect(page).toHaveScreenshot(`introspection-diff-${width}.png`,{fullPage:true});await accessible(page);
 await page.getByRole('link',{name:'All source runs'}).click();await expect(page.getByRole('heading',{name:'Introspection runs',exact:true})).toBeVisible();
 await expect(page).toHaveScreenshot(`introspection-history-${width}.png`,{fullPage:true});await accessible(page);
});
test('G-003: loading, unchanged, error and empty history are explicit',async({page})=>{
 const state=await mock(page);state.loading=true;state.run.diff=[];await page.goto(path);await expect(page.getByText('Preparing this view')).toBeVisible();await expect(page.getByText('No changes since the last introspection.')).toBeVisible();await accessible(page);
 state.loading=false;state.error=true;await page.reload();await expect(page.getByText('The run register is temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No changes since the last introspection.')).toBeVisible();
 state.empty=true;await page.getByRole('link',{name:'All source runs'}).click();await expect(page.getByText('No introspection runs yet')).toBeVisible();await accessible(page);
});
test('polls active progress and stops on completion; cancellation is restricted to cancellable states',async({page})=>{
 const state=await mock(page);state.run.state='reading';await page.clock.install();await page.goto(path);await expect(page.getByRole('button',{name:'Cancel introspection'})).toBeVisible();
 state.run.state='diffing';await page.clock.fastForward(5000);await expect(page.getByText('Introspection diffing',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cancel introspection'})).toHaveCount(0);
 state.run.state='complete';state.run.diff=[];await page.clock.fastForward(5000);await expect(page.getByText('No changes since the last introspection.')).toBeVisible();const count=state.requests;await page.clock.fastForward(15000);expect(state.requests).toBe(count);
 for(const phase of ['queued','connecting','reading']){state.run.state=phase;await page.reload();await page.getByRole('button',{name:'Cancel introspection'}).click();await expect(page.getByText('Introspection cancelled',{exact:true})).toHaveCount(2);}
 expect(state.cancels).toBe(3);
 state.role='viewer';state.run.state='reading';await page.reload();await expect(page.getByText('Introspection reading',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Cancel introspection'})).toHaveCount(0);
});
test('failed message is unchanged and history uses cursor pagination',async({page})=>{
 const state=await mock(page);state.run.state='failed';state.run.error='Source authentication failed.';await page.goto(path);await expect(page.getByRole('alert')).toHaveText(state.run.error);await accessible(page);
 await page.getByRole('link',{name:'All source runs'}).click();await page.getByRole('button',{name:'Load more runs'}).click();expect(state.cursor).toBe(true);
});

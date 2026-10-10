import {capture} from './capture.js';
import {fixture} from './settings-fixture.js';
import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {project,source} from './dashboard-fixture.js';
import {projectSettingDefinitions} from '../src/shared/project-settings.js';
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test('5.19 enforcement screen states administrator recovery and auditing',async({page})=>{await fixture(page);await page.goto(`/companies/${source}/settings`);await expect(page.getByText(/Company administrators retain magic-link access when SSO is enforced. Every use is audited/)).toBeVisible();await accessible(page);});
for(const width of [390,900,1440]){
 for(const section of ['settings','settings-discovery','settings-query','settings-evidence','settings-agents'])test(`Q-038 ${section} surface at ${width}`,{tag:'@visual'},async({page})=>{
  await fixture(page);await page.setViewportSize({width,height:1000});await page.goto(`/projects/${project}/${section}`);await expect(page.getByRole('heading',{level:1})).toBeVisible();if(section==='settings')await page.getByRole('button',{name:'Project details',exact:true}).click();await expect(page.getByRole('heading',{name:section==='settings'?'Project details':section==='settings-query'?'Limits and disclosure':section==='settings-discovery'?'Introspection':section==='settings-evidence'?'Retention and capture':'Pool keys and presence',exact:true})).toBeVisible();await accessible(page);await capture(page,test.info(),`${section}-${width}.png`,{fullPage:true});
 });
 for(const [path,name] of [[`/companies/${source}/settings`,'company'],['/settings','personal']])test(`Q-038 ${name} surface at ${width}`,{tag:'@visual'},async({page})=>{
  await fixture(page);await page.setViewportSize({width,height:1000});await page.goto(path!);await expect(page.getByRole('button',{name:'Save changes'})).toBeVisible();await accessible(page);await capture(page,test.info(),`${name}-${width}.png`,{fullPage:true});
 });
}
test('Q-006: viewer sees all controls read-only; sampling off without size is not incomplete',async({page})=>{const {dashboard}=await fixture(page);dashboard.admin=false;await page.goto(`/projects/${project}/settings-discovery`);for(const d of projectSettingDefinitions.filter(v=>v.path.startsWith('discovery.'))){await page.getByRole('button',{name:'Edit '+d.label,exact:true}).click();await expect(page.getByLabel(d.label,{exact:true})).toBeDisabled();}await expect(page.getByRole('button',{name:'Save changes'})).toBeDisabled();await expect(page.getByRole('alert')).toHaveCount(0);await accessible(page);});
test('Q-001/Q-002/Q-003 profile saves timezone and motion; email stays read-only',async({page})=>{const {state}=await fixture(page);await page.goto('/settings');await expect(page.getByLabel('Email')).toHaveAttribute('readonly','');await page.getByLabel('Timezone',{exact:true}).fill('America/Toronto');await page.getByLabel('Date format',{exact:true}).selectOption('DD/MM/YYYY');await page.getByLabel('Reduce motion',{exact:true}).check();await page.getByRole('button',{name:'Save changes'}).click();await expect.poll(()=>state.personal.timezone).toBe('America/Toronto');await expect.poll(()=>page.locator('style').allTextContents()).toContainEqual(expect.stringContaining('transition: none !important'));await accessible(page);});
test('Q-038 loading and error recover; unset query limits stay unset after unrelated save',async({page})=>{const {state}=await fixture(page);state.loading=true;await page.goto(`/projects/${project}/settings-query`);await expect(page.getByText('Preparing this view').first()).toBeVisible();await page.getByRole('button',{name:'Edit Query timeout (seconds)',exact:true}).click();await expect(page.getByLabel('Query timeout (seconds)',{exact:true})).toBeVisible();state.loading=false;await page.getByRole('button',{name:'Edit Minimum aggregate group size',exact:true}).click();await page.getByLabel('Minimum aggregate group size',{exact:true}).fill('1');await page.getByRole('button',{name:'Save changes'}).click();await expect.poll(()=>state.writes.length).toBe(1);expect(state.writes[0]).toEqual({query:{aggregateMinGroupSize:1}});state.error=true;await page.reload();await expect(page.getByText('Settings unavailable. Retry the request.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('button',{name:'Edit Query timeout (seconds)',exact:true}).click();await expect(page.getByLabel('Query timeout (seconds)',{exact:true})).toBeVisible();});

test('settings saves acknowledge a delayed write and show its refusal beside Save',async({page})=>{
 await fixture(page);await page.goto('/settings');await expect(page.getByRole('button',{name:'Save changes'})).toBeEnabled();
 let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/v1/me/settings',async route=>{if(route.request().method()!=='PATCH')return route.fallback();calls++;await gate;await route.fulfill({status:503,json:{error:{code:'dependency_unavailable',message:'Profile write unavailable. Try again.',requestId:'save',retryable:true}}});});
 try{await page.getByRole('button',{name:'Save changes'}).dblclick();await expect(page.getByRole('button',{name:'Saving…'})).toBeDisabled();expect(calls).toBe(1);release();
 const header=page.locator('.card-h').filter({has:page.getByRole('button',{name:'Save changes'})});await expect(header.getByRole('alert')).toHaveText('Profile write unavailable. Try again.');await expect(header.getByRole('button')).toBeEnabled();}finally{release();}
});

test('rename and migration acknowledge pending work and retain server refusals in their own form',async({page})=>{
 await fixture(page);await page.goto(`/projects/${project}/settings`);await page.getByRole('button',{name:'Project details',exact:true}).click();
 for(const action of ['rename','migrate'] as const){
  let release!:()=>void,calls=0;const gate=new Promise<void>(resolve=>{release=resolve;});
  const path=`**/api/v1/projects/${project}${action==='migrate'?'/migrate-industry':''}`;
  await page.route(path,async route=>{calls++;await gate;await route.fulfill({status:409,json:{error:{code:'conflict',message:`${action} refused by the server.`,requestId:action,retryable:false}}});});
  if(action==='migrate'){await page.getByText('Migrate industry',{exact:true}).click();await page.getByLabel(/Type .* to confirm migration/).fill('Reporting');}
  const label=action==='rename'?'Save name':'Migrate',pending=action==='rename'?'Saving…':'Migrating…';
  try{await page.getByRole('button',{name:label,exact:true}).dblclick();await expect(page.getByRole('button',{name:pending})).toBeDisabled();expect(calls).toBe(1);release();
  const form=page.locator('form').filter({has:page.getByRole('button',{name:label,exact:true})});await expect(form.getByRole('alert')).toHaveText(`${action} refused by the server.`);}finally{release();}
 }
});

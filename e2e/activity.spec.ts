import {capture} from './capture.js';
import {test} from './fixtures.js';
import {expect,type Page} from '@playwright/test';
import axe from 'axe-core';
import {mockActivity,activityPath,detailPath,pool} from './activity-fixture.js';
async function accessible(page:Page){await page.addScriptTag({content:axe.source});expect(await page.evaluate(async()=>(await axe.run()).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})))).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test.use({reducedMotion:'reduce'});
test('Activity: measured positions survive initial resize across three cold loads',async({browser})=>{
 const positions:Array<{dayTop:number;dayHeight:number;rowTop:number;rowHeight:number;cellHeight:number;lineHeight:string}>=[];
 for(let load=0;load<3;load++){
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try{
   const page=await context.newPage();await page.clock.setFixedTime(new Date('2026-10-06T15:43:00Z'));await mockActivity(page);
   await page.goto(`http://127.0.0.1:4173${activityPath}`);
   await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();
   await accessible(page);
   // Exercise the capture-state font/layout flush without comparing or writing
   // a baseline; the diagnostic showed pre-capture metrics can differ.
   await page.screenshot({animations:'disabled'});
   const measure=()=>page.evaluate(()=>{
    const day=document.querySelector('[data-part="day"]');const row=document.querySelector('.rec[data-mark-row]');
    const cell=row?.querySelector('.rhead > [data-part="timestamp"]');
    if(!day||!row||!cell)throw new Error('Activity geometry is not ready');
    const d=day.getBoundingClientRect(),r=row.getBoundingClientRect(),c=cell.getBoundingClientRect();
    return {dayTop:d.top,dayHeight:d.height,rowTop:r.top,rowHeight:r.height,cellHeight:c.height,lineHeight:getComputedStyle(cell).lineHeight};
   });
   await expect.poll(async()=>{const m=await measure();return {rowHeight:m.rowHeight,gap:m.rowTop-m.dayTop-m.dayHeight};}).toEqual({rowHeight:42,gap:0});
   await expect.poll(async()=>(await measure()).lineHeight).toBe('14.7px');
   const first=await measure();
   await expect.poll(async()=>{await page.waitForTimeout(100);return await measure();}).toEqual(first);
   positions.push(first);
  }finally{await context.close();}
 }
 expect(positions).toEqual([positions[0],positions[0],positions[0]]);
 console.log('Activity cold-load geometry',JSON.stringify(positions));
});
for(const width of [390,900,1440])test(`5.12 Activity and record at ${width}`,{tag:'@visual'},async({page})=>{
 await mockActivity(page);await page.setViewportSize({width,height:1000});await page.goto(activityPath);await expect(page.getByRole('heading',{name:'Requests',exact:true})).toBeVisible();await accessible(page);await capture(page,test.info(),`activity-${width}.png`,{fullPage:true});
 await page.getByRole('region',{name:'Activity records'}).locator('.rec[data-mark-row]').first().getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('link',{name:'Open evidence record',exact:true}).click();await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();await expect(page.getByRole('heading',{name:'Versions recorded at open'})).toBeVisible();await expect(page.getByText('Catalogue generation')).toBeVisible();await accessible(page);await capture(page,test.info(),`record-${width}.png`,{fullPage:true});
 await page.getByRole('navigation',{name:'Breadcrumb'}).getByRole('link',{name:'Activity',exact:true}).click();await expect(page.getByRole('heading',{name:'Activity',exact:true})).toBeVisible();
});
test('5.12 filters, cursor loading, empty, error, loading and incomplete states',async({page})=>{
 const state=await mockActivity(page);state.loading=true;await page.goto(activityPath);await expect(page.getByText('Preparing this view')).toBeVisible();await expect(page.getByRole('region',{name:'Activity records'}).getByRole('listitem').first()).toBeVisible();state.loading=false;
 await page.getByLabel('Pool',{exact:true}).selectOption(pool);await expect.poll(()=>state.requests.at(-1)).toContain('poolId='+pool);
 await page.getByRole('button',{name:/^Incomplete/}).click();await expect.poll(()=>state.requests.at(-1)).toContain('outcome=incomplete');
 await page.getByRole('button',{name:'Load more requests'}).click();await expect.poll(()=>state.requests.at(-1)).toContain('cursor=50');expect(await page.getByRole('region',{name:'Activity records'}).locator('.rec[data-mark-row]').count()).toBeLessThanOrEqual(12);
 state.empty=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText('No requests match',{exact:true})).toBeVisible();await accessible(page);
 state.error=true;await page.getByRole('button',{name:'Refresh',exact:true}).click();await expect(page.getByText('Evidence is temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await expect(page.getByText('No requests match',{exact:true})).toBeVisible();
 state.record={...state.record,status:'incomplete',completedAt:null,tokenKeyVersionUsed:null,rowCount:null,latencyMs:null,synthetic:null,elements:[],stages:[],sources:[]};await page.goto(detailPath);await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();await expect(page.getByText('Incomplete: the run opened but no completion was recorded. No answer was recorded.')).toBeVisible();await expect(page.getByText('Unknown — incomplete')).toBeVisible();await accessible(page);
 state.loading=true;await page.reload();await expect(page.getByText('Preparing this view')).toBeVisible();await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();await expect(page.getByText('Unknown — incomplete')).toBeVisible();state.loading=false;
 state.error=true;await page.reload();await expect(page.getByText('Evidence is temporarily unavailable.')).toBeVisible();state.error=false;await page.getByRole('button',{name:'Try again'}).click();await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();await expect(page.getByText('Unknown — incomplete')).toBeVisible();
 state.missing=true;await page.reload();await expect(page.getByText('Record not found',{exact:true})).toBeVisible();await accessible(page);
});

for(const width of [390,900,1440])test(`5.17 rollup and stored redaction at ${width}`,{tag:'@visual'},async({page})=>{
 const state=await mockActivity(page);state.total=1;
 state.record={...state.record,recordKind:'rollup',rolledUpAt:'2026-09-28T12:00:00Z',request:null,argumentVisibility:'hidden',elements:[],stages:[],sources:[],treatmentCounts:{clear:3,tokenized:2,withheld:1},sourceTreatmentCounts:{clear:2,tokenized:2,withheld:1},capturePercent:25,captureSelected:false,detailCaptured:false,redactions:[{at:'2026-09-01T12:00:00Z',policy:{redaction:'aggressive',allowlistedFields:[]},fields:['request']}]};state.entry=state.record;
 await page.setViewportSize({width,height:1000});await page.goto(activityPath);await expect(page.getByText('Retained answer summary',{exact:true})).toBeVisible();await expect(page.getByText('25% detail capture')).toBeVisible();await accessible(page);await capture(page,test.info(),`rollup-list-${width}.png`,{fullPage:true});
 await page.getByRole('region',{name:'Activity records'}).locator('.rec[data-mark-row]').first().getByRole('button',{name:'Details',exact:true}).click();await page.getByRole('link',{name:'Open evidence record',exact:true}).click();await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();await expect(page.getByRole('heading',{name:'Rollup · summary only'})).toBeVisible();await expect(page.getByText(/Treatment counts are summaries, not element-level delivery facts/)).toBeVisible();await expect(page.getByText(/Stored arguments redacted .* under aggressive/)).toBeVisible();await accessible(page);await capture(page,test.info(),`rollup-record-${width}.png`,{fullPage:true});
});

test('DOMAIN-002: past evidence displays its recorded assignment version and identifies legacy unknown versions',async({page})=>{
 const state=await mockActivity(page);
 state.record.tokenDeclarations=[{elementId:state.record.id,qualifiedName:'warehouse.public.treaties.treaty_ref',domain:'customer',domainVersion:2,canonId:'stdtext1',mode:'text',caseInsensitive:true}];
 await page.goto(detailPath);
 await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();
 await expect(page.getByText(/Domain: customer · Assignment version: 2 · Canonicaliser: stdtext1/)).toBeVisible();
 await accessible(page);
 state.record.tokenDeclarations[0]!.domainVersion=null;
 await page.reload();
 await page.getByRole('button',{name:'Full recorded metadata',exact:true}).click();
 await expect(page.getByText(/Assignment version: Not recorded/)).toBeVisible();
});

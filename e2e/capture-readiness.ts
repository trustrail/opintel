import {expect,type Page,type Request} from '@playwright/test';

type Requests={pending:Set<Request>;completed:Set<string>};
const observed=new WeakMap<Page,Requests>();
const apiPath=(request:Request)=>{const url=new URL(request.url());return url.pathname.startsWith('/api/v1/')?url.pathname:null;};

/** Installed before navigation, so a capture cannot miss an already pending request. */
export function observeCaptureRequests(page:Page){
 const state:Requests={pending:new Set(),completed:new Set()};observed.set(page,state);
 const start=(request:Request)=>{if(apiPath(request))state.pending.add(request);};
 const finish=(request:Request)=>{const path=apiPath(request);if(path){state.pending.delete(request);state.completed.add(path);}};
 page.on('request',start);page.on('requestfinished',finish);page.on('requestfailed',finish);
 return()=>{page.off('request',start);page.off('requestfinished',finish);page.off('requestfailed',finish);observed.delete(page);};
}

export async function waitForActivityData(page:Page){
 if(!new URL(page.url()).pathname.endsWith('/activity'))return null;
 const state=observed.get(page);if(!state)throw new Error('Activity capture requires the observed fixture.');
 const pendingAtStart=[...state.pending].map(apiPath);
 await expect.poll(()=>state.pending.size===0&&[...state.completed].some(path=>path.endsWith('/runs'))&&[...state.completed].some(path=>path.endsWith('/runs/summary')),{message:'Activity capture waits for request rows, rollup and all pending data requests'}).toBe(true);
 const screen=page.locator('[data-layout="activity"]');await expect(screen).toHaveAttribute('aria-busy','false');
 return {pendingAtStart,pendingDataRequests:state.pending.size,rows:await screen.getAttribute('data-rows-state'),rollup:await screen.getAttribute('data-rollup-state'),renderSettled:true};
}

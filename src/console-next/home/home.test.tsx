import {consoleLink} from '../../shared/console-destinations.mjs';
import React from 'react';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,renderHook,act,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Tooltip} from '../components/primitives.js';
import {HomeView,ListState} from './screen.js';
import {ProjectHealth} from '../../shared/api/project-health.js';
import {ActivityEntry,EvidenceDetail} from '../../shared/api/activity.js';
import {DashboardStats} from '../../shared/api/dashboard.js';
import {homeKeys,minuteStrip,orderNeeds,readHome,readCustodyReceipts,useHomeStream,useHome,type Project,type HomeData,type StreamConnection} from './data.js';
import {groupSettingNeeds,needsAreas,poolBadge} from './needs.js';
import {NeedsYouItem,type NeedsYouItem as Item} from '../../shared/api/needs-you.js';
import {useHomeState} from './state.js';
import {createApiClient} from '../../shared/api/client.js';
const id='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',now=new Date('2026-10-29T12:00:00.000Z');
const project:Project={id,name:'Reinsurance demo',company:{id,name:'Customer'},industry:{id,name:'Reinsurance'},region:'eu-west-1',role:'admin'};
const needs:Item[]=[{id:'check:engine',kind:'check_required' as const,title:'Verify engine: Local',count:1,targetRoute:`/projects/${id}/settings-engines`,roles:['admin' as const]},{id:'entitlement:1',kind:'undecided_entitlement' as const,title:'Recoveries · 1 column',count:1,targetRoute:`/projects/${id}/entitlements`,roles:['admin' as const],context:{pool:{id:other,name:'C2 Cedant 02'},targets:[{tableId:other,name:'recoveries',kind:'table',columnName:'counterparty_name',sourceName:'Cedant 02',schemaName:'public'}]}}];
const stats=DashboardStats.parse({asOf:now.toISOString(),utcDay:'2026-10-29',pools:2,sources:2,spectrum:{clear:31,tokenized:8,masked:5,aggregate_only:2,custody:3,withheld:2,undecided:3},requests:999,queries:999,prompts:0,refused:999,incomplete:0,connectedAgents:4,staleAgents:0});
const data:HomeData={stats,summary:{counts:{all:42,refused:7,incomplete:0,answerTreated:10},days:[],custody:[{day:'2026-10-29',state:'granted',origin:null,count:9}]},needs,needsComplete:true,minutes:null,asOf:now.toISOString(),from:'2026-10-29T00:00:00.000Z',to:now.toISOString()};
const health=ProjectHealth.parse({items:[{kind:'tls',status:'warning',checked_at:null,reason:'Self-signed TLS is in use.',next_action:{label:'Review TLS',href:`/projects/${id}/settings-project`}}]}).items;
const wrapper=({children}:{children:React.ReactNode})=><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Tooltip.Provider delayDuration={0}>{children}</Tooltip.Provider></QueryClientProvider>;
afterEach(()=>{useHomeState.setState({order:'all',theme:'light',expandedNeed:null,showAllNeeds:false});vi.useRealTimers();});
describe('Home contract',()=>{
 it('uses summary numbers, stats presence and actual needs; hides unavailable strip',()=>{
  render(<HomeView project={project} projects={[project]} data={data} health={health} live onProject={()=>{}}/>,{wrapper});
  expect(screen.getByRole('link',{name:'42 Requests, today UTC'}).getAttribute('href')).toContain('from=2026-10-29');
  expect(screen.getByRole('link',{name:'7 Refused, today UTC'}).getAttribute('href')).toContain('outcome=refused');
  expect(screen.getByRole('button',{name:'9 custody grants, today UTC'})).toBeTruthy();expect(screen.getByRole('button',{name:'4 agents connected now'})).toBeTruthy();
  expect(screen.queryByText('999')).toBeNull();expect(screen.queryByLabelText('Requests in the last 30 minutes')).toBeNull();
  expect(screen.queryByText('Evidence retention')).toBeNull();expect(screen.getByText('recoveries')).toBeTruthy();expect(screen.getByText('C2')).toBeTruthy();expect(screen.queryByText('Column stays hidden until treated')).toBeNull();
  fireEvent.click(screen.getByText('counterparty_name'));expect(screen.getByRole('button',{expanded:true})).toBeTruthy();expect(screen.getByText('Column stays hidden until treated')).toBeTruthy();
  expect(screen.getByRole('link',{name:'Decide'}).getAttribute('href')).toBe(consoleLink(needs[1]!.targetRoute));
 });
 it('orders the same complete queue for owners and operators without filtering information',()=>{
  const owner=orderNeeds(needs,'all','admin'),operator=orderNeeds(needs,'all','operator');expect(owner[0]?.kind).toBe('undecided_entitlement');expect(operator[0]?.kind).toBe('check_required');expect(new Set(owner.map(i=>i.id))).toEqual(new Set(operator.map(i=>i.id)));
  expect(orderNeeds(needs,'running','admin')).toEqual(operator);expect(orderNeeds(needs,'decisions','operator')).toEqual(owner);
 });
 it('renders loading, empty, error and ready; health has no invented mail icon',()=>{
  const view=render(<ListState state="loading"/>);expect(screen.getByRole('status').textContent).toContain('Loading');view.rerender(<ListState state="empty"/>);expect(screen.getByText('Nothing needs you right now.')).toBeTruthy();const retry=vi.fn();view.rerender(<ListState state="error" error={{message:'Service is unavailable.'}} retry={retry}/>);fireEvent.click(screen.getByRole('button',{name:'Retry'}));expect(retry).toHaveBeenCalledOnce();expect(screen.getByRole('alert').textContent).toContain('Service is unavailable.');view.unmount();
  render(<HomeView project={project} projects={[project]} data={{...data,needs:[],stats:{...stats,spectrum:{clear:0,tokenized:0,masked:0,aggregate_only:0,custody:0,withheld:0,undecided:0}}}} health={[]} live={false} onProject={()=>{}}/>,{wrapper});expect(screen.queryByText('Exposure')).toBeNull();expect(screen.queryByText('All checked')).toBeNull();expect(screen.getByText('Unknown')).toBeTruthy();expect(screen.queryByRole('button',{name:/mail/i})).toBeNull();expect(screen.getByText('Polling · 15 s')).toBeTruthy();
 });
 it('shows the seven shared treatment marks with named links and a real ring percentage',()=>{
  render(<HomeView project={project} projects={[project]} data={data} health={health} live onProject={()=>{}}/>,{wrapper});expect(screen.getByText('57%')).toBeTruthy();for(const name of ['Clear','Tokenized','Masked','Aggregate only','Under custody','Withheld','Undecided'])expect(screen.getAllByRole('img',{name})).toHaveLength(1);
 });
});
it('bins only complete recent data into actual minute counts, with no decorative bars',()=>{
 const run=ActivityEntry.parse({id,projectId:id,poolId:id,agentId:null,keyPrefix:'abc',mode:'query',startedAt:'2026-10-29T11:59:01.000Z',status:'refused',rowCount:null,latencyMs:2,synthetic:false,request:null,argumentVisibility:'hidden',versions:{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null}});
 const minutes=minuteStrip([run],now);expect(minutes).toHaveLength(30);expect(minutes.reduce((n,m)=>n+m.requests,0)).toBe(1);expect(minutes[28]).toMatchObject({requests:1,refused:1});expect(minuteStrip([],now).every(m=>m.requests===0)).toBe(true);
});
it('reads real contracts and all needs pages; does not draw a strip from incomplete request pages',async()=>{
 const paths:string[]=[];let recentPages=0;
 const fetcher=vi.fn(async(path:string)=>{paths.push(path);const body=path.includes('/needs-you')?{items:needs,nextCursor:null}:path.includes('/runs/summary')?data.summary:path.includes('/runs?')?{items:[],nextCursor:String(++recentPages)}:stats;return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)};});
 const read=await readHome(id,createApiClient(fetcher),now);expect(read.minutes).toBeNull();expect(recentPages).toBe(10);expect(read.needs).toEqual(needs);expect(paths.some(p=>p.includes('/runs/summary?from='))).toBe(true);
});
it('subscribes to completion, deduplicates sequences, coalesces refresh, polls at 15 s only while dropped and closes old projects',async()=>{
 vi.useFakeTimers();const cache=new QueryClient({defaultOptions:{queries:{retry:false}}}),invalidate=vi.spyOn(cache,'invalidateQueries').mockResolvedValue();
 const streams:StreamConnection[]=[],connect=vi.fn(()=>{const s:StreamConnection={onopen:null,onerror:null,onmessage:null,close:vi.fn()};streams.push(s);return s;});
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:{code:'not_found',message:'fixture',requestId:'test',retryable:false}}),{status:404}));
 const Provider=({children}:{children:React.ReactNode})=><QueryClientProvider client={cache}>{children}</QueryClientProvider>;
 const hook=renderHook(({p})=>{const live=useHomeStream(p,connect);const query=useHome(p,live);return {live,query};},{wrapper:Provider,initialProps:{p:id}});await act(async()=>{await vi.advanceTimersByTimeAsync(1);});const stream=streams[0]!;
 act(()=>stream.onopen?.(new Event('open')));await act(async()=>{await vi.advanceTimersByTimeAsync(50);});expect(hook.result.current.live).toBe(true);invalidate.mockClear();fetcher.mockClear();
 act(()=>{for(let i=1;i<=10;i++)stream.onmessage?.(new MessageEvent('message',{data:JSON.stringify({type:'run.completed',sequence:i,runId:id,poolId:id,outcome:'answered',at:now.toISOString()})}));});await act(async()=>{await vi.advanceTimersByTimeAsync(50);});expect(invalidate).toHaveBeenCalledTimes(2);expect(invalidate).toHaveBeenCalledWith({queryKey:homeKeys.scope(id)});expect(invalidate).toHaveBeenCalledWith({queryKey:homeKeys.projects()});
 act(()=>stream.onmessage?.(new MessageEvent('message',{data:JSON.stringify({type:'run.completed',sequence:1,runId:id,poolId:id,outcome:'answered',at:now.toISOString()})})));await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(fetcher).not.toHaveBeenCalled();
 act(()=>stream.onerror?.(new Event('error')));await act(async()=>{await vi.advanceTimersByTimeAsync(15000);});expect(hook.result.current.live).toBe(false);expect(fetcher).toHaveBeenCalled();
 hook.rerender({p:other});expect(stream.close).toHaveBeenCalledOnce();hook.unmount();expect(streams[1]?.close).toHaveBeenCalledOnce();cache.clear();
});

it('keeps every queue row mounted and focusable; expansion alone reveals its effect',()=>{
 const many=Array.from({length:27},(_,i)=>NeedsYouItem.parse({...needs[1],id:'column:'+i,context:{...needs[1]!.context,targets:[{...needs[1]!.context!.targets[0],columnName:'column_'+i}]}}));
 const view=render(<HomeView project={project} projects={[project]} data={{...data,needs:many}} health={health} live onProject={()=>{}}/>,{wrapper});
 expect(view.container.querySelectorAll('[data-needs-row]')).toHaveLength(27);expect(screen.getByRole('region',{name:'Needs-you items'}).getAttribute('tabindex')).toBe('0');
 expect(screen.getByText('column_26')).toBeTruthy();expect(view.container.textContent).not.toContain('—');expect(screen.queryByText('Column stays hidden until treated')).toBeNull();
 fireEvent.click(screen.getByText('column_26'));expect(screen.getByText('Column stays hidden until treated')).toBeTruthy();fireEvent.click(screen.getByText('column_26'));expect(screen.queryByText('Column stays hidden until treated')).toBeNull();
});
it('derives Data/Pools and Settings attention only from matching needs-you kinds',()=>{
 expect(needsAreas([needs[1]!])).toEqual({Home:true,Activity:false,Pools:true,Data:true,Settings:false});
 expect(needsAreas([needs[0]!])).toEqual({Home:true,Activity:false,Pools:false,Data:false,Settings:true});
 const view=render(<HomeView project={project} projects={[project]} data={{...data,needs:[needs[1]!]}} health={health} live onProject={()=>{}}/>,{wrapper});
 for(const name of ['Pools','Data'])expect(screen.getByRole('link',{name}).querySelector('[data-attention]')).toBeTruthy();expect(screen.getByRole('link',{name:'Settings'}).querySelector('[data-attention]')).toBeNull();view.unmount();
 expect(poolBadge('C2 Cedant 02')).toBe('C2');expect(poolBadge('Query pool')).toBe('QP');
});
it('health hover/focus exposes the actual reason, and entity icons name their kinds',async()=>{
 render(<HomeView project={project} projects={[project]} data={data} health={health} live onProject={()=>{}}/>,{wrapper});
 fireEvent.focus(screen.getByRole('button',{name:'TLS certificate: warning'}));await waitFor(()=>expect(screen.getByRole('tooltip').textContent).toContain('Self-signed TLS is in use.'));
 for(const kind of ['pool','table','column'])expect(screen.getAllByRole('img',{name:kind}).length).toBeGreaterThan(0);
});
it('reads every needs-you page, including beyond the former 100-page cap',async()=>{
 let n=0;const fetcher=async(path:string)=>{const body=path.includes('/needs-you')?{items:[{...needs[0],id:'check:'+n}],nextCursor:++n<101?String(n):null}:path.includes('/runs/summary')?data.summary:path.includes('/runs?')?{items:[],nextCursor:null}:stats;return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(body)};};
 const result=await readHome(id,createApiClient(fetcher),now);expect(n).toBe(101);expect(result.needs).toHaveLength(101);expect(result.needsComplete).toBe(true);
});

it('the Custody band opens only receipts with granted events, not other custody states',async()=>{
 const make=(id:string)=>ActivityEntry.parse({id,projectId:other,poolId:other,agentId:null,keyPrefix:'abc',mode:'query',startedAt:now.toISOString(),status:'answered',rowCount:1,latencyMs:1,synthetic:true,request:null,argumentVisibility:'hidden',versions:{policy:1,catalog:1,vocabulary:1,tokenKeyVersionSelected:null}});
 const granted=make(id),expired=make(other),detail=(run:typeof granted,kind:'granted'|'expired')=>EvidenceDetail.parse({...run,releaseEvents:[{grantId:id,receipt:run.id,provider:'local',kind,at:now.toISOString(),alias:'test',actor:null,jurObserved:null}],completedAt:now.toISOString(),tokenKeyVersionUsed:null,truncated:false,refusalCode:null,generatedSql:null,elements:[],stages:[],sources:[]});
 const fetcher=async(path:string)=>({ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(path.includes('/projects/')?{items:[granted,expired],nextCursor:null}:path.includes('/runs/'+id+'?')?detail(granted,'granted'):detail(expired,'expired'))});
 const result=await readCustodyReceipts(other,data.from,data.to,1,createApiClient(fetcher));expect(result.map(r=>r.id)).toEqual([id]);expect(Object.keys(result[0]!).sort()).toEqual(['id','rowCount','startedAt','status']);
});

it('phone disclosure shows the exact remaining count and expands in place without removing desktop rows',()=>{
 const many=Array.from({length:8},(_,i)=>NeedsYouItem.parse({...needs[1],id:'phone:'+i}));
 const view=render(<HomeView project={project} projects={[project]} data={{...data,needs:many}} health={health} live onProject={()=>{}}/>,{wrapper});
 expect(view.container.querySelectorAll('[data-needs-row]')).toHaveLength(8);expect(view.container.querySelectorAll('[data-phone-extra=true]')).toHaveLength(3);
 const more=screen.getByRole('button',{name:'3 more'});expect(more.getAttribute('aria-expanded')).toBe('false');expect(more.getAttribute('aria-controls')).toBe(screen.getByRole('region',{name:'Needs-you items'}).id);
 fireEvent.click(more);expect(view.container.querySelectorAll('[data-phone-extra=true]')).toHaveLength(0);expect(screen.getByRole('button',{name:'Show fewer'}).getAttribute('aria-expanded')).toBe('true');
 fireEvent.click(screen.getByRole('button',{name:'Show fewer'}));expect(view.container.querySelectorAll('[data-phone-extra=true]')).toHaveLength(3);
});
it('no phone disclosure appears for at most five items and a project switch resets it',()=>{
 const view=render(<HomeView project={project} projects={[project]} data={data} health={health} live onProject={()=>{}}/>,{wrapper});expect(view.container.querySelector('[data-needs-more]')).toBeNull();
 act(()=>{useHomeState.getState().toggleAllNeeds();});expect(useHomeState.getState().showAllNeeds).toBe(true);act(()=>{useHomeState.getState().setProject(other);});expect(useHomeState.getState().showAllNeeds).toBe(false);
});

it('groups only settings edited in the same form, preserving decisions and linking directly to its editor',()=>{
 const settings=['timeoutSeconds','rowLimit','memoryMb','concurrency'].map(path=>({...needs[0]!,kind:'setting_required' as const,id:'setting:query.'+path,targetRoute:`/projects/${id}/settings-query`,count:1}));
 const result=groupSettingNeeds([...settings,...needs],id);expect(result).toHaveLength(3);expect(result[0]).toMatchObject({title:'Set query limits · 4 values',count:4,targetRoute:`?project=${id}&screen=settings&section=query&edit=true`,roles:['admin']});expect(result.slice(1)).toEqual(needs);
 const view=render(<HomeView project={project} projects={[project]} data={{...data,needs:settings,stats:{...stats,spectrum:{clear:0,tokenized:0,masked:0,aggregate_only:0,custody:0,withheld:0,undecided:0}},minutes:[{at:now.toISOString(),requests:0,refused:0,custody:0}]}} health={health} live onProject={()=>{}}/>,{wrapper});
 expect(screen.getByText('Set query limits · 4 values')).toBeTruthy();expect(view.container.querySelectorAll('[data-needs-row]')).toHaveLength(1);expect(view.container.querySelector('[data-workbench]')?.getAttribute('data-exposure-visible')).toBe('false');expect(screen.getByText('No requests yet')).toBeTruthy();expect(screen.queryByRole('img',{name:/one-minute buckets/})).toBeNull();
});

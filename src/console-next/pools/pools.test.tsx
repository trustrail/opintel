import * as React from 'react';
import {selectOption} from '../test-select.js';
import {columnChoices,typedDraft,compatible,CreationRows,draftFromExpression} from './rows.js';
import type {ReactNode} from 'react';
import {afterEach,it,expect,vi} from 'vitest';
import {act,cleanup,render,screen,fireEvent,waitFor,within} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {TableIcon} from '../components/kind.js';
import {Tooltip} from '../components/primitives.js';
import {createApiClient} from '../../shared/api/client.js';
import {Pools} from './screen.js';
import {CreatePool,creationBody} from './create.js';
import {CredentialCommand,SetRows,newRule} from './commands.js';
import {readPools,readTables,sumPools,isConnected,credentialAgents} from './data.js';
import {usePoolsState} from './state.js';
import type {Project} from '../home/data.js';
const id='00000000-0000-4000-8000-000000000001',poolId='00000000-0000-4000-8000-000000000002',object='00000000-0000-4000-8000-000000000003',credential='00000000-0000-4000-8000-000000000004',now='2026-10-29T12:00:00.000Z';
const project:Project={id,name:'Project',company:{id,name:'Customer'},industry:{id,name:'Insurance'},region:'eu-west-1',role:'admin'};
const summary={id:poolId,name:'Cedant 02',sourceIds:[id],modeQuery:true,modePrompt:false,workingKeys:1,agents:99,activeAgents:98,clearElements:1,activeElements:2};
const detail={...summary,graceSeconds:60,keys:[],credentials:[{id:credential,label:'Analyst key',custodyAlias:'agent:analyst',state:'active',lastUse:null}]};
const member={id,group:'field',name:'field',qualifiedName:'warehouse.public.claims.field',objectId:object,objectName:'claims',objectLabel:'claims',sourceId:id,exposedType:'VARCHAR',sourceType:'text',treatment:'clear',maskKind:null,justification:null};
const table={objectId:object,sourceId:id,name:'claims',needsRows:true,reason:'rule_required'};
const agent={poolId,authenticatedWith:{kind:'credential',label:'Analyst key',alias:'agent:analyst'},agentId:'claims-agent',client:'Notebook',verified:false,keyVersion:credential,firstSeen:now,lastSeen:now,lastRequestAt:now,lastHeartbeatAt:now,staleAt:null,reconnects:0,state:'idle'};
const calls:Array<{path:string;body:unknown;method:string}>=[];
function response(path:string){const url=new URL(path,'http://test');if(url.pathname.endsWith('/history'))return {items:[],nextCursor:null};if(url.pathname.includes('/row-entitlements/'))return {objectId:object,objectName:'claims',poolId,scoped:false,columns:[],current:null};if(url.pathname.endsWith('/needs-you'))return {items:[],nextCursor:null};if(url.pathname.endsWith('/pools'))return {items:[summary],nextCursor:null};if(url.pathname===`/api/v1/pools/${poolId}`)return detail;if(url.pathname.endsWith('/tables'))return {items:[table],nextCursor:null};if(url.pathname.endsWith('/entitlement-members'))return {items:[member,{...member,id:object,name:'hidden',treatment:null}],nextCursor:null};if(url.pathname.endsWith('/agents'))return {items:[agent,{...agent,agentId:'old-agent',state:'stale'}],nextCursor:null};if(url.pathname.endsWith('/row-entitlements'))return {items:[],nextCursor:null,projectHasDefault:false,counts:{missing:1,overridden:0,inherited:0,unscoped:0}};if(url.pathname.endsWith('/catalog')&&url.searchParams.get('parent')===object)return {nodes:[{kind:'element',id,label:'field',childCount:null,exposedType:'VARCHAR',state:'clear'},{kind:'element',id:credential,label:'enabled',childCount:null,exposedType:'BOOLEAN',state:null}],nextCursor:null};if(url.pathname.endsWith('/catalog'))return {nodes:url.searchParams.has('parent')?[{kind:'object',id:object,label:'claims',childCount:2,exposedType:null,state:null}]:[{kind:'source',id,label:'Warehouse',childCount:1,exposedType:null,state:null}],nextCursor:null};throw new Error('Unexpected read '+path);}
function install(){vi.stubGlobal('fetch',vi.fn(async(path:string,init:{method:string;body?:string})=>{calls.push({path,method:init.method,body:init.body?JSON.parse(init.body) as unknown:null});return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(response(path))};}));}
function wrapper({children}:{children:ReactNode}){return <QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><Tooltip.Provider>{children}</Tooltip.Provider></QueryClientProvider>;}
afterEach(()=>{cleanup();vi.unstubAllGlobals();calls.length=0;usePoolsState.setState({pool:null,tab:'access',filter:null,createOpen:false});});
it('reads actual pool tables, column treatments and all presence; excludes stale from connected',async()=>{install();const facts=await readPools(id);expect(facts.pools[0]?.connected).toBe(1);expect(facts.pools[0]?.spectrum).toMatchObject({clear:1,undecided:1});expect(sumPools([...facts.pools,...facts.pools])).toMatchObject({columns:4,connected:2,tables:2});expect(isConnected({...facts.pools[0]!.agents[0]!,state:'disconnected'})).toBe(false);expect(calls.some(c=>c.path.includes('/tables?'))).toBe(true);});
it('does not silently drop later presence or column pages',async()=>{const client=createApiClient(async path=>{const url=new URL(path,'http://test');let body:unknown=response(path);if(url.pathname.endsWith('/agents'))body={items:[{...agent,agentId:url.searchParams.has('cursor')?'second':'first'}],nextCursor:url.searchParams.has('cursor')?null:'next'};return {ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(body)};});const result=await readPools(id,client);expect(result.pools[0]?.connected).toBe(2);});
it('finds tables across the real paged catalogue hierarchy',async()=>{install();const sources=await readTables(id);expect(sources[0]?.source.name).toBe('Warehouse');expect(sources[0]?.tables[0]?.id).toBe(object);expect(calls.some(c=>c.path.includes('objects%3A'))).toBe(true);});
it('creation confirms suggested threads and places concurrency among optional limits without rowsPerDay',async()=>{install();render(<CreatePool project={id} pools={[]} onClose={()=>{}} onCreated={()=>{}}/>,{wrapper});await screen.findByRole('button',{name:/Warehouse/});expect(screen.getByLabelText('Threads per query').getAttribute('required')).not.toBeNull();expect(screen.queryByLabelText(/I confirm/)).toBeNull();expect(screen.getByRole('button',{name:'Create pool'}).hasAttribute('disabled')).toBe(true);expect(screen.queryByText(/rows per day/i)).toBeNull();expect(screen.getByLabelText('Queries at once').closest('[data-more-limits]')).not.toBeNull();expect(screen.getByLabelText('Queries at once').getAttribute('placeholder')).toBe('project limit');const body=creationBody('Pool',[object],{...newRule(),all:true},'','1',{concurrency:'2',memoryMb:''});expect(body.budgets).toEqual({threads:1,concurrency:2});expect(body.tableSetup?.rowRule).toEqual({allRows:true});expect(()=>creationBody('Pool',[object],newRule(),'','0',{})).toThrow();});
it('All pools aggregates columns once per pool, opens pools and filters connected agents',async()=>{install();render(<Pools project={project}/>,{wrapper});await screen.findByText('All 1 pool');fireEvent.click(screen.getByRole('button',{name:/Cedant 02.*table/}));await screen.findByRole('tab',{name:/Access/});fireEvent.mouseDown(screen.getByRole('tab',{name:/Agents & people/}),{button:0,ctrlKey:false});await screen.findByText('claims-agent');expect(screen.queryByRole('tab',{name:'By person'})).toBeNull();expect(screen.queryByText('Federated')).toBeNull();expect(screen.getByText(/People appear with identity federation/)).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'1 now'}));await waitFor(()=>expect(screen.queryByText('old-agent')).toBeNull());expect(screen.getByText('claims-agent')).toBeTruthy();});
it('viewer never calls the restricted row rule read and has no write menus',async()=>{install();usePoolsState.setState({pool:poolId});render(<Pools project={{...project,role:'viewer'}}/>,{wrapper});await screen.findByText('claims');expect(calls.some(c=>c.path.includes('row-entitlements'))).toBe(false);expect(screen.queryByRole('button',{name:'Set rows'})).toBeNull();expect(screen.queryByRole('button',{name:'Grant access'})).toBeNull();});
it('column counts and treatment marks open only their real matching members',async()=>{install();usePoolsState.setState({pool:poolId});render(<Pools project={project}/>,{wrapper});await screen.findByRole('button',{name:'2 columns'});fireEvent.click(screen.getByRole('button',{name:'2 columns'}));expect(await screen.findByRole('heading',{name:'All columns'})).toBeTruthy();const link=screen.getByRole('link',{name:/column field pool Cedant 02/});expect(link.getAttribute('href')).toContain('elementId=');expect(link.getAttribute('href')).not.toContain('rowObjectId=');});
it('credential rotation requires a confirmation and does not call a write on opening',async()=>{install();const pool=(await readPools(id)).pools[0]!;render(<CredentialCommand project={id} pool={pool} action={{kind:'rotate',credential:pool.detail.credentials![0]!}} onClose={()=>{}} onIssued={()=>{}}/>,{wrapper});expect(screen.getByRole('button',{name:'Confirm rotation'}).hasAttribute('disabled')).toBe(true);expect(calls.filter(c=>c.method==='POST')).toHaveLength(0);fireEvent.click(screen.getByRole('checkbox'));expect(screen.getByRole('button',{name:'Confirm rotation'}).hasAttribute('disabled')).toBe(false);});
it('row editor submits typed rules to the table rows endpoint',async()=>{install();const fetcher=vi.mocked(fetch);const original=fetcher.getMockImplementation()!;fetcher.mockImplementation(async(input,init)=>init?.method==='PUT'?new Response(JSON.stringify({...table,needsRows:false,reason:null}),{status:200}):original(input,init));const close=vi.fn();render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={close}/>,{wrapper});await selectOption('Row rule column',/^field · VARCHAR/);fireEvent.change(screen.getByLabelText('Row rule value'),{target:{value:'cedant_02'}});fireEvent.click(screen.getByRole('button',{name:'Apply'}));await waitFor(()=>expect(close).toHaveBeenCalled());const call=fetcher.mock.calls.find(c=>c[1]?.method==='PUT');expect(call?.[0]).toContain(`/tables/${object}/rows`);expect(call?.[1]?.method).toBe('PUT');});
it('errors remain visible and retryable instead of producing invented zero totals',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({error:{code:'dependency_unavailable',message:'Engine unavailable',requestId:id,retryable:true}}),{status:503})));render(<Pools project={project}/>,{wrapper});expect(await screen.findByRole('alert')).toBeTruthy();expect(screen.getByText('Engine unavailable')).toBeTruthy();expect(screen.getByRole('button',{name:'Retry'})).toBeTruthy();});

it('row-band numbers switch to Access and apply their row-status filter',async()=>{install();usePoolsState.setState({pool:poolId,tab:'agents'});render(<Pools project={project}/>,{wrapper});await screen.findByRole('link',{name:'View rows set'});fireEvent.click(screen.getByRole('link',{name:'View rows set'}));expect(screen.getByRole('tab',{name:/Access/}).getAttribute('data-state')).toBe('active');expect(usePoolsState.getState().filter).toBe('rows_missing');expect(await screen.findByRole('button',{name:'Set rows'})).toBeTruthy();});

it('finishes refreshing before publishing a rotated key, so completion cannot close the next dialog',async()=>{
 install();const pool=(await readPools(id)).pools[0]!,cache=new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}});let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});const invalidate=vi.spyOn(cache,'invalidateQueries').mockImplementation(()=>gate),onIssued=vi.fn(),onClose=vi.fn(),secret='opk_live_'+'a'.repeat(22);
 vi.mocked(fetch).mockImplementationOnce(async()=>new Response(JSON.stringify({poolId,keyVersion:credential,prefix:'opk_live_aaaa',createdAt:now,state:'current',graceUntil:null,keyShown:true,key:secret}),{status:200}));
 render(<QueryClientProvider client={cache}><Tooltip.Provider><CredentialCommand project={id} pool={pool} action={{kind:'rotate',credential:pool.detail.credentials![0]!}} onClose={onClose} onIssued={onIssued}/></Tooltip.Provider></QueryClientProvider>);
 fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Confirm rotation'}));await waitFor(()=>expect(invalidate).toHaveBeenCalled());expect(onIssued).not.toHaveBeenCalled();finish();await waitFor(()=>expect(onIssued).toHaveBeenCalled());expect(onClose).not.toHaveBeenCalled();await waitFor(()=>expect(cache.getMutationCache().getAll().every(m=>m.state.data===undefined)).toBe(true));expect(JSON.stringify(cache.getQueryCache().getAll())).not.toContain(secret);
});

it('progress rings name decided and missing states without labelling them clear treatments',async()=>{install();usePoolsState.setState({pool:poolId});render(<Pools project={project}/>,{wrapper});const progress=await screen.findByRole('group',{name:'columns decided'});expect(within(progress).getByRole('link',{name:'1 column decided'})).toBeTruthy();expect(within(progress).queryByRole('link',{name:'1 Clear'})).toBeNull();expect(within(screen.getByRole('group',{name:'rows set'})).getByRole('link',{name:'1 row missing'})).toBeTruthy();});

it('the active-credential band count excludes revoked rows from its destination',async()=>{
 install();vi.mocked(fetch).mockImplementation(async path=>new Response(JSON.stringify(new URL(String(path),'http://test').pathname===`/api/v1/pools/${poolId}`?{...detail,credentials:[...detail.credentials,{...detail.credentials[0],id:object,label:'Revoked key',state:'revoked'}]}:response(String(path))),{status:200}));
 usePoolsState.setState({pool:poolId});render(<Pools project={project}/>,{wrapper});fireEvent.click(await screen.findByRole('button',{name:'1 active credential'}));await screen.findByRole('tab',{name:/Who can get in/});const list=document.querySelector('[data-credential-list]');expect(list?.textContent).toContain('Analyst key');expect(list?.textContent).not.toContain('Revoked key');expect(usePoolsState.getState().filter).toBe('active_credentials');
});

it('uses real view metadata and hides an unavailable table kind instead of guessing',async()=>{
 const client=createApiClient(async path=>({ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(path.includes('/needs-you')?{items:[{id:'row:claims',kind:'missing_row_decision',title:'Claims rows',count:1,targetRoute:`/projects/${id}/entitlements`,roles:['admin'],context:{pool:{id:poolId,name:'Cedant 02'},targets:[{tableId:object,name:'claims',kind:'view',columnName:null,sourceName:'Warehouse',schemaName:'public'}]}}],nextCursor:null}:response(path))}));const facts=await readPools(id,client);expect(facts.kinds[object]).toBe('view');render(<><TableIcon kind={facts.kinds[object]}/><TableIcon kind={undefined}/></>,{wrapper});expect(screen.getByRole('img',{name:'view'})).toBeTruthy();expect(screen.queryByRole('img',{name:'table'})).toBeNull();
});

it('column types drive row controls and backend-compatible per-table chips',async()=>{
 const text={kind:'element' as const,id,label:'account',childCount:null,exposedType:'VARCHAR',state:null},number={...text,id:object,exposedType:'INTEGER'},boolean={...text,id:credential,label:'enabled',exposedType:'BOOLEAN'};
 const columns=[{tableId:id,columns:[text,boolean]},{tableId:object,columns:[number]}],choices=columnChoices(columns),chosen=choices.find(c=>c.name==='account')!,draft=typedDraft({...newRule(),column:'account',value:'Acme'},chosen);
 expect(compatible([text],{...draft,type:'text'})).toBe(true);expect(compatible([number],{...draft,type:'text'})).toBe(false);expect(compatible([],{...draft,type:'text'})).toBe(false);expect(compatible([{...text,label:null}],{...draft,all:true})).toBe(false);
 const bool=choices.find(c=>c.name==='enabled')!,boolDraft=typedDraft({...newRule(),column:'enabled',value:'true'},bool);render(<CreationRows draft={boolDraft} column={bool} choices={choices} tables={columns.map((t,i)=>({...t,name:'Table '+i}))} kinds={{}} onChange={()=>{}}/>,{wrapper});
 expect(screen.queryByLabelText('Value type')).toBeNull();expect(screen.getByRole('combobox',{name:'Row rule column'})).toBeTruthy();fireEvent.keyDown(screen.getByRole('combobox',{name:'Row rule operator'}),{key:'ArrowDown'});expect(await screen.findAllByRole('option')).toHaveLength(2);fireEvent.keyDown(document,{key:'Escape'});expect(screen.getByRole('combobox',{name:'Row rule value'})).toBeTruthy();expect(document.querySelectorAll('[data-row-coverage] li')).toHaveLength(2);expect(document.querySelector('[data-row-coverage] [data-status=ok]')?.textContent).toContain('Table 0');expect(screen.getByText('gets no rows until its own rule')).toBeTruthy();
});
it('a labelled suggested thread value is accepted on creation without a second confirmation',async()=>{
 install();render(<CreatePool project={id} pools={[]} onClose={()=>{}} onCreated={()=>{}}/>,{wrapper});fireEvent.change(screen.getByLabelText('Pool name'),{target:{value:'One pool'}});const source=await screen.findByRole('button',{name:/Warehouse/});fireEvent.click(source);await screen.findByRole('checkbox',{name:'Choose claims'});fireEvent.click(screen.getByRole('checkbox',{name:'Choose claims'}));await selectOption('Row rule column',/^field · VARCHAR/);expect(screen.queryByText(/I confirm/)).toBeNull();expect(screen.getByText('1 table chosen · maximum 50')).toBeTruthy();expect(screen.getByRole('button',{name:'Create pool'}).hasAttribute('disabled')).toBe(false);
});
it('credential lanes keep every name claimed until name identity is verified',async()=>{
 install();const pool=(await readPools(id)).pools[0]!;pool.detail.keys.push({poolId,keyVersion:credential,credentialId:credential,prefix:'opk_live_aaaa',createdAt:now,state:'current',graceUntil:null});pool.agents.push({...pool.agents[0]!,agentId:'legacy',authenticatedWith:{kind:'legacy_pool_key'},state:'disconnected'});for(let n=0;n<8;n++)pool.agents.push({...pool.agents[0]!,agentId:'extra-'+n,state:'stale'});const seen=credentialAgents(pool,credential,'agent:analyst');expect(seen).toHaveLength(11);expect(seen.every(item=>!item.bound)).toBe(true);expect(seen.find(a=>a.agent.agentId==='old-agent')?.bound).toBe(false);expect(seen.find(a=>a.agent.agentId==='legacy')?.bound).toBe(false);
});
it('All pools Waiting is an untruncated count with hover details and no stray Data label',async()=>{install();render(<Pools project={project}/>,{wrapper});await screen.findByText('All 1 pool');expect(document.querySelector('[data-waiting-count]')?.textContent).toBe('2');expect(document.querySelector('[data-pool-data]')).toBeNull();expect(document.querySelector('[data-pool-switch] [data-project-monogram]')?.textContent).toBe('');fireEvent.click(screen.getByRole('button',{name:/Cedant 02.*table/}));expect(document.querySelector('[data-pool-switch] [data-project-monogram]')?.textContent).toBe('C2');expect(document.querySelector('[data-pool-switch] [data-project-monogram] [data-kind]')).toBeNull();});

it('the same condition builder adds, combines and removes typed conditions without nesting',async()=>{
 function Form(){const [draft,setDraft]=React.useState(newRule());return <CreationRows draft={draft} choices={[{name:'id',type:'INTEGER',tables:1,totalTables:1,tableNames:['claims']}]} tables={[]} kinds={{}} onChange={setDraft}/>;}
 render(<Form/>,{wrapper});await selectOption('Row rule column',/^id · INTEGER · claims/);fireEvent.change(screen.getByLabelText('Row rule value'),{target:{value:'2'}});fireEvent.click(screen.getByRole('button',{name:'Add condition'}));await selectOption('Combine conditions',/^OR/);await selectOption('Row rule column 2',/^id · INTEGER/);fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:'4'}});expect(screen.getByRole('combobox',{name:'Combine conditions'}).textContent).toContain('OR');fireEvent.click(screen.getByRole('button',{name:'Remove condition 1'}));expect(screen.queryByRole('combobox',{name:'Combine conditions'})).toBeNull();expect((screen.getByLabelText('Row rule value') as HTMLInputElement).value).toBe('4');
});
it('column choices group shared names first and identify the selected tables',()=>{
 const c={kind:'element' as const,id,label:'cedant',childCount:null,exposedType:'VARCHAR',state:null};const choices=columnChoices([{tableId:id,name:'claims',columns:[c,{...c,label:'amount'}]},{tableId:object,name:'policies',columns:[c]}]);expect(choices[0]).toMatchObject({name:'cedant',tables:2,totalTables:2,tableNames:['claims','policies']});expect(choices[1]).toMatchObject({name:'amount',tables:1,tableNames:['claims']});
});
it('per-table creation sends each table’s own rule through the existing create and add endpoints',async()=>{
 const second='00000000-0000-4000-8000-000000000005',created=vi.fn();install();
 vi.mocked(fetch).mockImplementation(async(input,init)=>{const path=String(input),method=init?.method??'GET',body=typeof init?.body==='string'?JSON.parse(init.body):null;calls.push({path,method,body});const url=new URL(path,'http://test');let value:unknown;
 if(method==='POST'&&path.endsWith('/pools'))value={poolId,keyVersion:credential,prefix:'opk_live_first',createdAt:now,state:'current',graceUntil:null,keyShown:false,tables:[{...table,needsRows:false,reason:null}]};
 else if(method==='POST'&&path.endsWith('/tables'))value={poolId,tables:[{...table,objectId:second,name:'policies',needsRows:false,reason:null}]};
 else if(url.pathname.endsWith('/catalog')&&url.searchParams.get('parent')===second)value={nodes:[{kind:'element',id:second,label:'account',childCount:null,exposedType:'VARCHAR',state:null}],nextCursor:null};
 else if(url.pathname.endsWith('/catalog')&&url.searchParams.get('parent')==='objects:'+id)value={nodes:[{kind:'object',id:object,label:'claims',childCount:2,exposedType:null,state:null},{kind:'object',id:second,label:'policies',childCount:1,exposedType:null,state:null}],nextCursor:null};
 else value=response(path);
 return new Response(JSON.stringify(value),{status:200});});
 render(<CreatePool project={id} pools={[]} onClose={()=>{}} onCreated={created}/>,{wrapper});fireEvent.change(screen.getByLabelText('Pool name'),{target:{value:'Specific rules'}});fireEvent.click(await screen.findByRole('button',{name:/Warehouse/}));fireEvent.click(await screen.findByRole('checkbox',{name:'Choose claims'}));fireEvent.click(screen.getByRole('checkbox',{name:'Choose policies'}));fireEvent.click(screen.getByRole('button',{name:'Done'}));fireEvent.click(screen.getByRole('checkbox',{name:'Set a rule per table'}));
 const claims=await screen.findByRole('region',{name:'Row rule for claims'}),policies=await screen.findByRole('region',{name:'Row rule for policies'});fireEvent.click(within(claims).getByRole('checkbox'));fireEvent.keyDown(within(policies).getByRole('combobox',{name:'Row rule column'}),{key:'ArrowDown'});fireEvent.click(await screen.findByRole('option',{name:/^account · VARCHAR/}));fireEvent.change(within(policies).getByLabelText('Row rule value'),{target:{value:'cedant_02'}});fireEvent.click(screen.getByRole('button',{name:'Create pool'}));await waitFor(()=>expect(created).toHaveBeenCalledTimes(1));
 const writes=calls.filter(c=>c.method==='POST');expect(writes).toHaveLength(2);expect(writes[0]?.body).toMatchObject({tableSetup:{tables:[object],rowRule:{allRows:true}}});expect(writes[1]?.body).toEqual({projectId:id,tables:[second],rowRule:{column:'account',operator:'=',value:'cedant_02'}});
});


const mixedConditions=[{column:'claim_amount',operator:'>' as const,value:1000},{column:'loss_date',operator:'<=' as const,value:'2026-11-01'}];
function mixedApi(expression?:string,dateType='DATE',twoTables=false){
 install();vi.mocked(fetch).mockImplementation(async(input,init)=>{
  const path=String(input),method=init?.method??'GET',url=new URL(path,'http://test');calls.push({path,method,body:typeof init?.body==='string'?JSON.parse(init.body):null});
  const columns=[{kind:'element',id,label:'claim_amount',childCount:null,exposedType:'DECIMAL(18,2)',state:null},{kind:'element',id:credential,label:'loss_date',childCount:null,exposedType:dateType,state:null}];let value:unknown;
  if(method==='POST'&&url.pathname.endsWith('/pools'))value={poolId,keyVersion:credential,prefix:'opk_live_first',createdAt:now,state:'current',graceUntil:null,keyShown:false,tables:[{...table,needsRows:false,reason:null}]};
  else if(method==='POST'&&url.pathname.endsWith('/tables'))value={poolId,tables:[{...table,objectId:credential,name:'policies',needsRows:false,reason:null}]};
  else if(method==='PUT')value={...table,needsRows:false,reason:null};
  else if(url.pathname.endsWith('/history'))value={items:[],nextCursor:null};
  else if(url.pathname.includes('/row-entitlements/'))value={objectId:object,objectName:'claims',poolId,scoped:!!expression,columns:columns.map(c=>({id:c.id,name:c.label,sourceIdentifier:c.label,type:c.exposedType})),current:expression?{id:credential,expression,hash:'stored',actorId:id,decidedAt:now,firstScoping:false}:null};
  else if(url.pathname.endsWith('/catalog')&&[object,credential].includes(url.searchParams.get('parent')??''))value={nodes:columns,nextCursor:null};
  else if(twoTables&&url.pathname.endsWith('/catalog')&&url.searchParams.get('parent')==='objects:'+id)value={nodes:[{kind:'object',id:object,label:'claims',childCount:2,exposedType:null,state:null},{kind:'object',id:credential,label:'policies',childCount:2,exposedType:null,state:null}],nextCursor:null};
  else value=response(path);
  return new Response(JSON.stringify(value),{status:200});
 });
}
async function fillMixedConditions(combine:'and'|'or'){
 await selectOption('Row rule column',/^claim_amount ·/);await selectOption('Row rule operator','>');fireEvent.change(screen.getByLabelText('Row rule value',{exact:true}),{target:{value:'1000'}});
 fireEvent.click(screen.getByRole('button',{name:'Add condition'}));
 await selectOption('Row rule column 2',/^loss_date ·/);await selectOption('Row rule operator 2','<=');fireEvent.change(screen.getByLabelText('Row rule value 2',{exact:true}),{target:{value:'2026-11-01'}});
 if(combine==='or')await selectOption('Combine conditions',/^OR/);
}
it.each(['and','or'] as const)('per-table mixed numeric/date %s rule enables submission and sends every typed condition',async combine=>{
 mixedApi();const closed=vi.fn();render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={closed}/>,{wrapper});
 await fillMixedConditions(combine);
 expect(screen.getByRole('combobox',{name:'Row rule column'}).textContent).toContain('claim_amount');
 expect((screen.getByLabelText('Row rule value',{exact:true}) as HTMLInputElement).value).toBe('1000');
 const apply=screen.getByRole('button',{name:'Apply'});expect(apply.hasAttribute('disabled')).toBe(false);
 const form=apply.closest('form')!;for(const input of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[required],select[required]'))expect(input.checkValidity(),input.outerHTML).toBe(true);
 fireEvent.submit(form);await waitFor(()=>expect(closed).toHaveBeenCalledTimes(1));
 expect(calls.filter(c=>c.method==='PUT').map(c=>c.body)).toEqual([{projectId:id,rowRule:{combine,conditions:mixedConditions}}]);
});
it.each(['and','or'] as const)('creation mixed numeric/date %s rule preserves every condition',async combine=>{
 mixedApi();render(<CreatePool project={id} pools={[]} onClose={()=>{}} onCreated={()=>{}}/>,{wrapper});
 fireEvent.change(screen.getByLabelText('Pool name'),{target:{value:'Mixed types'}});fireEvent.click(await screen.findByRole('button',{name:/Warehouse/}));fireEvent.click(await screen.findByRole('checkbox',{name:'Choose claims'}));fireEvent.click(screen.getByRole('button',{name:'Done'}));
 await fillMixedConditions(combine);expect(screen.getByRole('button',{name:'Create pool'}).hasAttribute('disabled')).toBe(false);
 const form=screen.getByRole('button',{name:'Create pool'}).closest('form')!;for(const input of form.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input[required],select[required]'))expect(input.checkValidity(),input.outerHTML).toBe(true);
 fireEvent.submit(form);await waitFor(()=>expect(calls.some(c=>c.method==='POST')).toBe(true));
 expect(calls.find(c=>c.method==='POST')?.body).toMatchObject({tableSetup:{rowRule:{combine,conditions:mixedConditions}}});
});

it.each(['and','or'] as const)('current mixed %s rule is prefilled and identifies an incomplete condition',async combine=>{
 const expression=`("claim_amount" > 1000 ${combine.toUpperCase()} "loss_date" <= '2026-11-01')`;
 mixedApi(expression);render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={()=>{}}/>,{wrapper});
 expect(await screen.findByText('Saving replaces the current rule: '+expression)).toBeTruthy();
 expect(screen.getByRole('combobox',{name:'Combine conditions'}).textContent).toContain(combine.toUpperCase());
 expect((screen.getByLabelText('Row rule value') as HTMLInputElement).value).toBe('1000');expect((screen.getByLabelText('Row rule value 2') as HTMLInputElement).value).toBe('2026-11-01');
 expect(screen.getByRole('button',{name:'Apply'}).hasAttribute('disabled')).toBe(false);
 fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:''}});
 expect(screen.getByRole('button',{name:'Apply'}).hasAttribute('disabled')).toBe(true);
 expect(screen.getByText(/Condition 2.*loss_date.*required/i)).toBeTruthy();
});

it.each(['and','or'] as const)('mixed %s timestamp input accepts the minute precision supplied by the browser',async combine=>{
 mixedApi(undefined,'TIMESTAMP');render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={()=>{}}/>,{wrapper});
 await fillMixedConditions(combine);fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:'2026-11-01T00:00'}});
 expect(screen.getByRole('button',{name:'Apply'}).hasAttribute('disabled')).toBe(false);
 fireEvent.click(screen.getByRole('button',{name:'Apply'}));await waitFor(()=>expect(calls.some(c=>c.method==='PUT')).toBe(true));
 expect(calls.find(c=>c.method==='PUT')?.body).toMatchObject({rowRule:{combine,conditions:[mixedConditions[0],{...mixedConditions[1],value:'2026-11-01T00:00:00'}]}});
});

it.each(['and','or'] as const)('batched %s condition edits do not overwrite another condition',async combine=>{
 mixedApi();render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={()=>{}}/>,{wrapper});await fillMixedConditions(combine);
 act(()=>{fireEvent.change(screen.getByLabelText('Row rule value'),{target:{value:'2000'}});fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:'2026-10-31'}});});
 expect((screen.getByLabelText('Row rule value') as HTMLInputElement).value).toBe('2000');
 expect((screen.getByLabelText('Row rule value 2') as HTMLInputElement).value).toBe('2026-10-31');
 fireEvent.click(screen.getByRole('button',{name:'Apply'}));await waitFor(()=>expect(calls.some(c=>c.method==='PUT')).toBe(true));
 expect(calls.find(c=>c.method==='PUT')?.body).toMatchObject({rowRule:{combine,conditions:[{...mixedConditions[0],value:2000},{...mixedConditions[1],value:'2026-10-31'}]}});
});

it('condition callbacks from one render compose without reverting another field',()=>{
 let latest={...newRule(),column:'claim_amount',operator:'>' as const,value:'1000',type:'number' as const,combine:'and' as const,extra:[{column:'loss_date',operator:'<=' as const,value:'2026-11-01',type:'text' as const}]} as import('./rows.js').RuleDraft;
 render(<CreationRows draft={latest} choices={[{name:'claim_amount',type:'DECIMAL(18,2)',tables:1},{name:'loss_date',type:'DATE',tables:1}]} tables={[]} kinds={{}} onChange={update=>{latest=typeof update==='function'?update(latest):update;}}/>,{wrapper});
 fireEvent.change(screen.getByLabelText('Row rule value'),{target:{value:'2000'}});fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:'2026-10-31'}});
 expect(latest.value).toBe('2000');expect(latest.extra?.[0]?.value).toBe('2026-10-31');
});

it.each(['and','or'] as const)('per-table creation retains mixed %s rules separately for two tables',async combine=>{
 mixedApi(undefined,'DATE',true);const created=vi.fn();render(<CreatePool project={id} pools={[]} onClose={()=>{}} onCreated={created}/>,{wrapper});
 fireEvent.change(screen.getByLabelText('Pool name'),{target:{value:'Mixed per table'}});fireEvent.click(await screen.findByRole('button',{name:/Warehouse/}));
 fireEvent.click(await screen.findByRole('checkbox',{name:'Choose claims'}));fireEvent.click(screen.getByRole('checkbox',{name:'Choose policies'}));fireEvent.click(screen.getByRole('button',{name:'Done'}));fireEvent.click(screen.getByRole('checkbox',{name:'Set a rule per table'}));
 for(const name of ['claims','policies']){
  const region=await screen.findByRole('region',{name:'Row rule for '+name}),local=within(region);
  const select=async(label:string,option:RegExp)=>{fireEvent.keyDown(local.getByRole('combobox',{name:label}),{key:'ArrowDown'});fireEvent.click(await screen.findByRole('option',{name:option}));};
  fireEvent.click(local.getByRole('button',{name:'Add condition'}));await select('Row rule column',/^claim_amount ·/);await select('Row rule operator',/^>$/);fireEvent.change(local.getByLabelText('Row rule value'),{target:{value:name==='claims'?'1000':'2000'}});
  await select('Row rule column 2',/^loss_date ·/);await select('Row rule operator 2',/^<=$/);fireEvent.change(local.getByLabelText('Row rule value 2'),{target:{value:'2026-11-01'}});if(combine==='or')await select('Combine conditions',/^OR/);
 }
 const save=screen.getByRole('button',{name:'Create pool'});expect(save.hasAttribute('disabled')).toBe(false);fireEvent.click(save);await waitFor(()=>expect(created).toHaveBeenCalled());
 const writes=calls.filter(c=>c.method==='POST');expect(writes).toHaveLength(2);
 expect(writes[0]?.body).toMatchObject({tableSetup:{tables:[object],rowRule:{combine,conditions:mixedConditions}}});
 expect(writes[1]?.body).toEqual({projectId:id,tables:[credential],rowRule:{combine,conditions:[{...mixedConditions[0],value:2000},mixedConditions[1]]}});
});
it('a retained condition callback cannot discard a condition added by a later callback',()=>{
 const initial={...newRule(),column:'claim_amount',operator:'>' as const,value:'1000',type:'number' as const};
 const updates:Array<(current:import('./rows.js').RuleDraft)=>import('./rows.js').RuleDraft>=[];
 render(<CreationRows draft={initial} choices={[{name:'claim_amount',type:'DECIMAL(18,2)',tables:1}]} tables={[]} kinds={{}} onChange={update=>updates.push(update)}/>,{wrapper});
 fireEvent.change(screen.getByLabelText('Row rule value'),{target:{value:'2000'}});fireEvent.click(screen.getByRole('button',{name:'Add condition'}));
 const added=updates[1]!(initial),edited=updates[0]!(added);expect(edited.value).toBe('2000');expect(edited.extra).toHaveLength(1);
});
it('prefill retains All rows and refuses to silently flatten nested or unsupported stored expressions',()=>{
 const columns=[{id,name:'claim_amount',sourceIdentifier:'claim_amount',type:'DECIMAL(18,2)'},{id:credential,name:'loss_date',sourceIdentifier:'loss_date',type:'DATE'}];
 expect(draftFromExpression('("claim_amount" IS NULL OR "claim_amount" IS NOT NULL)',columns)?.all).toBe(true);
 expect(draftFromExpression('(claim_amount > 1 AND (loss_date < \'2026-11-01\' OR loss_date > \'2026-12-01\'))',columns)).toBeNull();
 expect(draftFromExpression('claim_amount IN (1,2)',columns)).toBeNull();
});
it.each(['and','or'] as const)('adding a date condition to the current numeric rule saves both with %s',async combine=>{
 const expression='"claim_amount" > 1000';mixedApi(expression);const closed=vi.fn();render(<SetRows project={id} pool={poolId} table={{objectId:object,name:'claims'}} onClose={closed}/>,{wrapper});
 await screen.findByText('Saving replaces the current rule: '+expression);expect((screen.getByLabelText('Row rule value') as HTMLInputElement).value).toBe('1000');expect(screen.getByRole('combobox',{name:'Row rule column'}).textContent).toContain('claim_amount');
 fireEvent.click(screen.getByRole('button',{name:'Add condition'}));await selectOption('Row rule column 2',/^loss_date ·/);await selectOption('Row rule operator 2',/^<=$/);fireEvent.change(screen.getByLabelText('Row rule value 2'),{target:{value:'2026-11-01'}});if(combine==='or')await selectOption('Combine conditions',/^OR/);
 expect(screen.getByRole('button',{name:'Apply'}).hasAttribute('disabled')).toBe(false);fireEvent.click(screen.getByRole('button',{name:'Apply'}));await waitFor(()=>expect(closed).toHaveBeenCalled());
 expect(calls.find(c=>c.method==='PUT')?.body).toEqual({projectId:id,rowRule:{combine,conditions:mixedConditions}});
});
it('minute precision conversion keeps invalid dates and missing zones invalid',()=>{
 const column={name:'when',type:'TIME',tables:1},draft=typedDraft({...newRule(),column:'when',value:'12:30'},column);
 expect(draft.value).toBe('12:30:00');expect(compatible([{kind:'element',id,label:'when',childCount:null,exposedType:'TIME',state:null}],draft)).toBe(true);
 for(const [type,value] of [['DATE','2026-02-31'],['TIMESTAMPTZ','2026-11-01T12:30'],['TIME','12:']] as const){const invalid=typedDraft({...newRule(),column:'when',value},{...column,type});expect(compatible([{kind:'element',id,label:'when',childCount:null,exposedType:type,state:null}],invalid)).toBe(false);}
});

it.each([false,true])('Grant access sends only public XQ metadata when selected; linked=%s',async linked=>{
 install();const pool=(await readPools(id)).pools[0]!,identity={certificateId:223,deviceName:'device-one',recipientIdentifier:'public-device-subject'};
 vi.stubGlobal('fetch',vi.fn(async(path:string,init:{method:string;body?:string})=>{calls.push({path,method:init.method,body:init.body?JSON.parse(init.body):null});const data=path.includes('/custody-identities')?{items:[identity],nextCursor:null}:init.method==='POST'?{poolId,keyVersion:credential,prefix:'opk_live_new',createdAt:now,state:'current',graceUntil:null,keyShown:true,key:'opk_live_'+'A'.repeat(22)}:response(path);return {ok:true,status:200,headers:{get:()=>null},text:async()=>JSON.stringify(data)};}));
 const issued=vi.fn();render(<CredentialCommand project={id} pool={pool} action={{kind:'issue'}} onClose={()=>{}} onIssued={issued}/>,{wrapper});
 await screen.findByText('Needed only if this agent will receive values released under custody.');fireEvent.change(screen.getByLabelText('Credential label'),{target:{value:'Analyst'}});
 if(linked){await waitFor(()=>expect(calls.some(c=>c.path.includes('/custody-identities'))).toBe(true));fireEvent.click(screen.getByRole('combobox',{name:'XQ identity for custody'}));fireEvent.click(await screen.findByRole('option',{name:'device-one · certificate 223'}));}
 fireEvent.click(screen.getByRole('button',{name:'Issue credential'}));await waitFor(()=>expect(issued).toHaveBeenCalled());expect(calls.find(c=>c.method==='POST'&&c.path.endsWith('/credentials'))?.body).toEqual({projectId:id,label:'Analyst',...linked?{certificateAssociation:identity}:{}});expect(document.body.textContent).not.toContain('public-device-subject');
});

import {afterEach,it,expect,vi} from 'vitest';
import {cleanup,render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Tooltip} from '../components/primitives.js';
import {ProjectSettings} from './project.js';
import {selectOption} from '../test-select.js';
import type {Project} from '../home/data.js';
import type {ApiFetchInit} from '../../shared/api/client.js';
const id='00000000-0000-4000-8000-000000000001',next='00000000-0000-4000-8000-000000000002',at='2026-10-30T00:00:00Z';
const project:Project={id,name:'Review',role:'admin',company:{id,name:'Company'},industry:{id,name:'Insurance'},region:'eu-west-1'};
function mount(role:Project['role']='admin'){
 const calls:Array<{path:string;body:unknown;method:string}>=[];
 vi.stubGlobal('fetch',vi.fn(async(input:string,init:ApiFetchInit)=>{
  const path=String(input),method=init?.method??'GET';calls.push({path,method,body:init?.body?JSON.parse(String(init.body)):null});
  const view={id,companyId:id,name:'Renamed',industry:{id:next,name:'Energy',inheritedTermCount:2},region:'eu-west-1',createdAt:at};
  const value=path.includes('dryRun')?{from:{id,name:'Insurance',termCount:1},to:{id:next,name:'Energy',termCount:2},shadowedTerms:[],projectTermsRetained:3,entitlementsAffected:0,confirmationPhrase:project.name}:method==='PATCH'||method==='POST'?view:path.includes('/companies?')?{items:[{id,name:'Company',role:'admin',projectCount:1}],nextCursor:null}:path.endsWith('/industries')?[{id,name:'Insurance',slug:'insurance',description:null,inheritedTermCount:1,hasDemoPack:false},{id:next,name:'Energy',slug:'energy',description:null,inheritedTermCount:2,hasDemoPack:false}]:{email:'admin@example.test'};
  return new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
 }));
 render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Tooltip.Provider><ProjectSettings project={{...project,role}}/></Tooltip.Provider></QueryClientProvider>);return calls;
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it('Project has exactly Name and Industry; rename is inline through the existing endpoint',async()=>{
 const calls=mount();expect(document.querySelectorAll('[data-setting-row]')).toHaveLength(2);
 fireEvent.click(screen.getByRole('button',{name:'Edit'}));fireEvent.change(screen.getByLabelText('Project name'),{target:{value:'Renamed'}});fireEvent.click(screen.getByRole('button',{name:'Save name'}));
 await waitFor(()=>expect(calls.some(c=>c.method==='PATCH')).toBe(true));expect(calls.find(c=>c.method==='PATCH')).toEqual({path:`/api/v1/projects/${id}`,method:'PATCH',body:{name:'Renamed'}});
});
it('industry migration retains consequences, dry-run and typed confirmation through the existing endpoint',async()=>{
 const calls=mount();fireEvent.click(screen.getByRole('button',{name:'Migrate industry'}));await screen.findByRole('combobox',{name:'Destination industry'});
 await waitFor(()=>expect(calls.some(c=>c.path.endsWith('/industries'))).toBe(true));await selectOption('Destination industry','Energy');
 const migrate=screen.getByRole('button',{name:'Migrate'});expect(migrate.hasAttribute('disabled')).toBe(true);
 fireEvent.click(screen.getByRole('button',{name:'Review consequences'}));await screen.findByText(/3 project terms retained/);expect(screen.getByText(/existing entitlements are unchanged/)).toBeTruthy();
 fireEvent.change(screen.getByLabelText('Industry migration confirmation'),{target:{value:'wrong'}});expect(migrate.hasAttribute('disabled')).toBe(true);
 fireEvent.change(screen.getByLabelText('Industry migration confirmation'),{target:{value:project.name}});fireEvent.click(migrate);
 await waitFor(()=>expect(calls.some(c=>c.path.endsWith('/migrate-industry'))).toBe(true));expect(calls.find(c=>c.path.endsWith('/migrate-industry'))?.body).toEqual({industryId:next,confirmation:project.name});
});
it('a non-admin gets both rows read-only',()=>{const calls=mount('viewer');expect(document.querySelectorAll('[data-setting-row]')).toHaveLength(2);expect(screen.queryByRole('button')).toBeNull();expect(calls).toHaveLength(0);});

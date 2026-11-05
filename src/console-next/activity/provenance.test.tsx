import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Tooltip} from '../components/primitives.js';
import {it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {Provenance} from '../../shared/api/provenance.js';
import {ProvenanceBody} from './provenance.js';
import {Navigation} from '../components/navigation.js';
const id='00000000-0000-4000-8000-000000000001';
it('shows six ordered expandable provenance steps and explicit historical gaps',()=>{
 const kinds=['request','policy','sources','execution','custody','evidence'];
 const record=Provenance.parse({receiptId:id,projectId:id,startedAt:'2026-11-05T00:00:00Z',steps:kinds.map(kind=>({kind,title:kind,recorded:kind!=='request',facts:[{key:kind==='request'?'certificate':'id',label:kind,recorded:kind!=='request',value:kind==='request'?null:id,copyable:kind!=='request'}]}))});
 render(<QueryClientProvider client={new QueryClient()}><Tooltip.Provider><ProvenanceBody record={record}/></Tooltip.Provider></QueryClientProvider>);
 expect(screen.getByRole('button',{name:/1. request/})).toBeTruthy();
 expect(screen.getByRole('button',{name:/2. policy/}).getAttribute('aria-haspopup')).toBe('dialog');
 expect(screen.getByRole('list',{name:'Recorded provenance chain'}).children).toHaveLength(6);
 fireEvent.click(screen.getByRole('button',{name:/2. policy/}));
 expect(screen.getByRole('dialog',{name:'policy'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Copy '+id})).toBeTruthy();
});
it('governance navigation labels and glossary preserve screen destinations',()=>{
 render(<QueryClientProvider client={new QueryClient()}><Tooltip.Provider><Navigation project={id} active="Data" needs={[]}/></Tooltip.Provider></QueryClientProvider>);
 for(const [label,scope] of [['Catalog','data'],['Entitlements','pools'],['Audit','activity']] as const){const link=screen.getByRole('link',{name:label});expect(link.getAttribute('href')).toContain('screen='+scope);expect(link.getAttribute('title')).toBeTruthy();}
 expect(screen.getByRole('link',{name:'Catalog'}).getAttribute('aria-current')).toBe('page');
});

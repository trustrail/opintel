import {it,expect} from 'vitest';
import {render,screen,fireEvent} from '@testing-library/react';
import {Provenance} from '../../shared/api/provenance.js';
import {ProvenanceBody} from './provenance.js';
import {Navigation} from '../components/navigation.js';
const id='00000000-0000-4000-8000-000000000001';
it('shows six ordered expandable provenance steps and explicit historical gaps',()=>{
 const kinds=['request','policy','sources','execution','custody','evidence'];
 const record=Provenance.parse({receiptId:id,projectId:id,startedAt:'2026-11-05T00:00:00Z',steps:kinds.map(kind=>({kind,title:kind,recorded:kind!=='request',facts:[{key:kind==='request'?'certificate':'id',label:kind,recorded:kind!=='request',value:kind==='request'?null:id,copyable:kind!=='request'}]}))});
 render(<ProvenanceBody record={record}/>);
 expect(screen.getByText('certificate not recorded')).toBeTruthy();
 expect(screen.getByRole('button',{name:/2. policy/}).getAttribute('aria-expanded')).toBe('false');
 fireEvent.click(screen.getByRole('button',{name:/2. policy/}));
 expect(screen.getByRole('button',{name:/2. policy/}).getAttribute('aria-expanded')).toBe('true');
 expect(screen.getByRole('button',{name:'Copy '+id})).toBeTruthy();
 expect(screen.getByRole('list',{name:'Recorded provenance chain'}).children).toHaveLength(6);
});
it('governance navigation labels and glossary preserve screen destinations',()=>{
 render(<Navigation project={id} active="Data" needs={[]}/>);
 for(const [label,scope] of [['Catalog','data'],['Entitlements','pools'],['Audit','activity']] as const){const link=screen.getByRole('link',{name:label});expect(link.getAttribute('href')).toContain('screen='+scope);expect(link.getAttribute('title')).toBeTruthy();}
 expect(screen.getByRole('link',{name:'Catalog'}).getAttribute('aria-current')).toBe('page');
});

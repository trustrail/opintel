import type {ReactNode} from 'react';
import {it,expect,vi} from 'vitest';
import {render,screen,fireEvent,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {readFileSync} from 'node:fs';
import {CopyName} from './copy-name.js';
import {StateBadge,RecordTime,DetailSheet} from './records.js';
import {Tooltip} from './primitives.js';
import {accountKeys} from './account.js';
import {provenanceState,stepSummary} from '../activity/provenance.js';
const wrap=(children:ReactNode,timezone='America/Toronto')=>{const client=new QueryClient();client.setQueryData(accountKeys.personal(),{timezone});return <QueryClientProvider client={client}><Tooltip.Provider delayDuration={0}>{children}</Tooltip.Provider></QueryClientProvider>;};
it('identifier retains the complete copy value, native keyboard button and shared ellipsis/touch foundation',async()=>{
 const id='00000000-0000-4000-8000-000000000001',writeText=vi.fn(async()=>{});Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText}});
 render(wrap(<CopyName name={id} variant="identifier"/>));const button=screen.getByRole('button',{name:'Copy '+id});expect(button.hasAttribute('data-copy-identifier')).toBe(true);expect(button.querySelector('code')?.textContent).toBe(id);button.focus();expect(document.activeElement).toBe(button);fireEvent.click(button);await waitFor(()=>expect(writeText).toHaveBeenCalledWith(id));await waitFor(()=>expect(button.title).toBe('Copied · '+id));
 const css=readFileSync('src/console-next/components/records.css','utf8');expect(css).toContain('[data-copy-identifier] code');expect(css).toContain('text-overflow:ellipsis;white-space:nowrap;font-family:monospace');expect(css).toContain('min-height:var(--touch)');
});
it.each(['recorded','not recorded','refused','redeemed','revoked','expired'])('renders %s as a badge',state=>{render(wrap(<StateBadge state={state}/>));expect(screen.getByText(state).hasAttribute('data-badge')).toBe(true);});
it('recorded custody state is used; a missing step stays not recorded',()=>{
 const step={kind:'custody' as const,title:'Custody',recorded:true,facts:[{field:'state:id',label:'State',recorded:true,value:'redeemed',copyable:false}]};expect(provenanceState(step)).toBe('redeemed');expect(provenanceState({...step,recorded:false})).toBe('not recorded');expect(provenanceState({...step,facts:[...step.facts,{field:'state:other',label:'State',recorded:true,value:'granted',copyable:false}]})).toBe('recorded');
});
it('renders recorded times in the personal timezone without changing the timestamp',()=>{render(wrap(<RecordTime at="2026-11-05T18:00:00Z"/>));const time=screen.getByText(new Date('2026-11-05T18:00:00Z').toLocaleString(undefined,{timeZone:'America/Toronto'}));expect(time.getAttribute('dateTime')).toBe('2026-11-05T18:00:00Z');});
it('phone detail uses the existing bottom-sheet surface',()=>{
 vi.mocked(window.matchMedia).mockImplementation(query=>({matches:query==='(max-width:700px)',media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}));render(wrap(<DetailSheet open onClose={()=>{}} title="Recorded detail"><p>Content</p></DetailSheet>));const dialog=screen.getByRole('dialog',{name:'Recorded detail'});expect(dialog.hasAttribute('data-activity-receipt')).toBe(true);expect(dialog.hasAttribute('data-dialog')).toBe(false);
});

it('uses singular row count in the execution summary',()=>{expect(stepSummary({kind:'execution',title:'Execution',recorded:true,facts:[{field:'outcome',label:'Outcome',recorded:true,value:'served',copyable:false},{field:'rows',label:'Rows returned',recorded:true,value:'1',copyable:false}]})).toBe('Answered · 1 row');});

// @vitest-environment happy-dom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {act,cleanup,render,screen} from '@testing-library/react';
import {DisplayPreferences,formatTimestamp,Timestamp} from '../src/app/settings/preferences.js';
import {formatRelativeTime} from '../src/app/settings/timestamp-clock.js';

const settings=vi.hoisted(()=>({value:{timezone:'UTC',dateFormat:'YYYY-MM-DD',reducedMotion:false}}));
vi.mock('../src/app/settings/data.js',()=>({usePersonalSettings:()=>({data:settings.value})}));
const now=Date.parse('2026-10-06T13:43:00Z');
const past=(milliseconds:number)=>new Date(now-milliseconds).toISOString();

beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(now);settings.value={timezone:'UTC',dateFormat:'YYYY-MM-DD',reducedMotion:false};});
afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();});

it.each([
 [0,'just now'],[59_999,'just now'],[60_000,'1 minute ago'],
 [3_599_999,'59 minutes ago'],[3_600_000,'1 hour ago'],
 [7_200_000,'2 hours ago'],[86_399_999,'23 hours ago'],
 [86_400_000,'1 day ago'],[7*86_400_000,'7 days ago'],
 [8*86_400_000,'8 days ago'],[30*86_400_000,'30 days ago'],
 [-1,'in less than a minute'],[-59_999,'in less than a minute'],
 [-60_000,'in 1 minute'],[-3_599_999,'in 59 minutes'],[-3_600_000,'in 1 hour'],
 [-7_200_000,'in 2 hours'],[-86_400_000,'in 1 day'],[-8*86_400_000,'in 8 days'],
] as const)('§5.5 elapsed age at %s ms: %s',(age,label)=>{
 expect(formatRelativeTime(past(age),now)).toBe(label);
});

it('labels Toronto with the zone in force, preserving date format and seconds',()=>{
 expect(formatTimestamp('2026-10-06T13:43:12Z','America/Toronto','YYYY-MM-DD')).toBe('2026-10-06 09:43:12 EDT');
 expect(formatTimestamp('2026-01-02T01:00:00Z','America/Toronto','DD/MM/YYYY')).toBe('01/01/2026 20:00:00 EST');
 expect(formatTimestamp('2026-01-02T01:00:00Z','UTC','MM/DD/YYYY')).toBe('01/02/2026 01:00:00 UTC');
});

it('renders absolute plus relative, retains datetime, and responds to preference changes',()=>{
 const value=past(7_200_000);const tree=()=> <DisplayPreferences><Timestamp value={value}/></DisplayPreferences>;
 const view=render(tree());
 expect(view.container.querySelector('time')?.textContent).toBe('2026-10-06 11:43:00 UTC · 2 hours ago');
 expect(view.container.querySelector('time')?.getAttribute('datetime')).toBe(value);
 settings.value={timezone:'America/Toronto',dateFormat:'DD/MM/YYYY',reducedMotion:false};view.rerender(tree());
 expect(view.container.querySelector('time')?.textContent).toBe('06/10/2026 07:43:00 EDT · 2 hours ago');
 expect(screen.getByText('06/10/2026 07:43:00 EDT').classList.contains('audw')).toBe(true);
 expect(screen.getByText('2 hours ago').classList.contains('audw')).toBe(true);
});

it('shares one minute clock, updates timestamps without rerendering their parent, and cleans up',()=>{
 let renders=0;
 // Keep event time stable even when the shared clock advances.
 const event=past(59_000);
 function StableParent(){renders++;return <><Timestamp value={event} appearance="rwhen"/><Timestamp value={event} appearance="when"/></>;}
 const view=render(<StableParent/>);expect(vi.getTimerCount()).toBe(1);
 const initialRenders=renders;
 expect(screen.getAllByText(/^just now$/)).toHaveLength(2);
 act(()=>vi.advanceTimersByTime(60_000));
 expect(screen.getAllByText(/^1 minute ago$/)).toHaveLength(2);expect(renders).toBe(initialRenders);
 view.unmount();expect(vi.getTimerCount()).toBe(0);
 // A later mount takes a fresh time, not the last unmounted snapshot.
 vi.setSystemTime(now+3_600_000);render(<Timestamp value={event}/>);
 expect(screen.getByText(/^1 hour ago$/)).not.toBeNull();
});

it('refreshes immediately when a hidden tab becomes visible',()=>{
 const event=past(60_000);render(<Timestamp value={event}/>);
 expect(screen.getByText(/^1 minute ago$/)).not.toBeNull();
 const visibility=vi.spyOn(document,'visibilityState','get');
 visibility.mockReturnValue('hidden');vi.setSystemTime(now+7_200_000);
 act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(screen.getByText(/^1 minute ago$/)).not.toBeNull();
 visibility.mockReturnValue('visible');act(()=>document.dispatchEvent(new Event('visibilitychange')));
 expect(screen.getByText(/^2 hours ago$/)).not.toBeNull();
});

it.each(['audw','rwhen','when'] as const)('shares intact timestamp parts in %s presentation',appearance=>{
 const view=render(<Timestamp value={past(7_200_000)} appearance={appearance}/>);
 const timestamp=view.container.querySelector('time');expect(timestamp?.getAttribute('data-part')).toBe('timestamp');
 expect(timestamp?.children.length).toBe(2);expect(timestamp?.querySelector('[data-part="absolute"]')?.textContent).toBe('2026-10-06 11:43:00 UTC');
 expect(timestamp?.querySelector('[data-part="relative"]')?.textContent).toBe('2 hours ago');
});

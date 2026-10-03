// @vitest-environment happy-dom
import {act,cleanup,fireEvent,render,screen} from '@testing-library/react';
import {afterEach,expect,it,vi} from 'vitest';
import {AsyncButton,ErrorState} from '../src/shared/ui/index.js';
afterEach(cleanup);
it('holds a read action through completion, suppresses repeated clicks and renders the refusal at the control',async()=>{
 let finish!:(value:unknown)=>void;
 const run=vi.fn(()=>new Promise(resolve=>{finish=resolve;}));
 render(<AsyncButton run={run} pendingLabel="Refreshing…">Refresh</AsyncButton>);
 const button=screen.getByRole('button');
 fireEvent.click(button);fireEvent.click(button);
 expect(run).toHaveBeenCalledTimes(1);expect((button as HTMLButtonElement).disabled).toBe(true);expect(button.textContent).toBe('Refreshing…');
 await act(async()=>finish({isError:true,error:{message:'The source is unavailable.'}}));
 expect((button as HTMLButtonElement).disabled).toBe(false);
 expect(button.parentElement?.contains(screen.getByRole('alert'))).toBe(true);
 expect(screen.getByRole('alert').textContent).toBe('The source is unavailable.');
});
it('shared retry remains disabled until the retry promise settles',async()=>{
 let finish!:()=>void;
 render(<ErrorState title="Unavailable" description="Try again." retry={()=>new Promise<void>(resolve=>{finish=resolve;})}/>);
 fireEvent.click(screen.getByRole('button'));
 expect((screen.getByRole('button',{name:'Trying again…'}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>finish());
 expect((screen.getByRole('button',{name:'Try again'}) as HTMLButtonElement).disabled).toBe(false);
});

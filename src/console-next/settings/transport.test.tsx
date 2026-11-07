import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import type {ReactNode} from 'react';
import {afterEach,expect,it} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {Tooltip} from '../components/primitives.js';
import {EngineTransportPanel} from './transport.js';
afterEach(cleanup);
const wrap=(children:ReactNode)=><QueryClientProvider client={new QueryClient()}><Tooltip.Provider>{children}</Tooltip.Provider></QueryClientProvider>;
it('shows sampled engine scheduling delay and its measurement limits using shared details',()=>{
 render(wrap(<EngineTransportPanel name="Engine" telemetry={null} runtime={{sampledAt:'2026-11-07T04:00:46.306Z',windowMs:11000,samples:20,eventLoop:{meanMs:20,p99Ms:10000,maxMs:10500}}} onClose={()=>{}}/>));
 expect(screen.getByText('20 ms / 10000 ms / 10500 ms')).toBeTruthy();expect(screen.getByText('11000 ms · 20 samples')).toBeTruthy();expect(screen.getByText('Event-loop delay · mean / p99 / max').tabIndex).toBe(0);
});
it('keeps absent measurements explicit',()=>{
 render(wrap(<EngineTransportPanel name="Engine" telemetry={null} onClose={()=>{}}/>));expect(screen.getByText('No retained engine scheduling sample.')).toBeTruthy();
});

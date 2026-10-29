import {afterEach,vi} from 'vitest';
import {cleanup} from '@testing-library/react';
afterEach(()=>{cleanup();vi.restoreAllMocks();});
Object.defineProperty(window,'matchMedia',{writable:true,value:vi.fn().mockImplementation((query:string)=>({matches:query==='(prefers-reduced-motion)',media:query,onchange:null,addListener:vi.fn(),removeListener:vi.fn(),addEventListener:vi.fn(),removeEventListener:vi.fn(),dispatchEvent:vi.fn()}))});
class TestResizeObserver {observe(){} unobserve(){} disconnect(){}}
globalThis.ResizeObserver=TestResizeObserver;

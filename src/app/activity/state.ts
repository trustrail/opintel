import {createStore} from 'zustand/vanilla';
export const activityRowHeight=116;
export const activityWindowSize=12;
export function createActivityState(){return createStore<{top:number;scroll:(top:number)=>void}>(set=>({top:0,scroll:top=>set(s=>Math.floor(s.top/activityRowHeight)===Math.floor(top/activityRowHeight)?s:{top})}));}

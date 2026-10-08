import {createStore} from 'zustand/vanilla';
export const activityRowHeight=42;
export const activityWindowSize=12;
export function createActivityState(){return createStore<{
 top:number;width:number;expanded:ReadonlySet<string>;heights:Record<string,number>;
 scroll:(top:number)=>void;resize:(width:number)=>void;measure:(id:string,height:number)=>void;toggle:(id:string)=>void;
}>(set=>({top:0,width:1000,expanded:new Set(),heights:{},
 scroll:top=>set(s=>Math.floor(s.top/42)===Math.floor(top/42)?s:{top}),
 resize:width=>set(s=>s.width===width?s:{width,heights:{}}),
 measure:(id,height)=>set(s=>s.heights[id]===height?s:{heights:{...s.heights,[id]:height}}),
 toggle:id=>set(s=>{const expanded=new Set(s.expanded);if(expanded.has(id))expanded.delete(id);else expanded.add(id);const heights={...s.heights};delete heights[id];return {expanded,heights};}),
}));}

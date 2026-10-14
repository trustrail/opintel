import {useId,useMemo} from 'react';
import {createStore} from 'zustand/vanilla';
import {useStore} from 'zustand';
import {Button} from '../../shared/ui/index.js';
type PoolState={id:string;name:string;status:'inherited'|'overridden'|'missing'|'unscoped'};
/** Status lists stay bounded, including after expanding an inherited count. */
export function PoolInheritance({pools}:{pools:readonly PoolState[]}){
 const id=useId(),store=useMemo(()=>createStore<{open:boolean;page:number;overridePage:number}>(()=>({open:false,page:0,overridePage:0})),[]),state=useStore(store);
 const overrides=pools.filter(p=>p.status==='overridden'),inherited=pools.filter(p=>p.status==='inherited'),missing=pools.filter(p=>p.status==='missing').length,unscoped=pools.filter(p=>p.status==='unscoped').length;
 const page=(items:readonly PoolState[],n:number)=>items.slice(n*50,(n+1)*50).map(p=><span className="ichip" key={p.id}>{p.name} · {p.status}</span>);
 return <section className="seg" aria-label="Pool row inheritance"><div className="interp">{page(overrides,state.overridePage)}</div>{overrides.length>50?<div className="filters"><Button variant="ghost" disabled={!state.overridePage} onClick={()=>store.setState({overridePage:state.overridePage-1})}>Previous overridden pools</Button><Button variant="ghost" disabled={(state.overridePage+1)*50>=overrides.length} onClick={()=>store.setState({overridePage:state.overridePage+1})}>Next overridden pools</Button></div>:null}
 <div className="filters"><button type="button" className="toolchip" aria-expanded={state.open} aria-controls={id} onClick={()=>store.setState({open:!state.open})}>{inherited.length} inherited pools</button>{missing?<span className="note">{missing} pools missing filters · zero rows</span>:null}{unscoped?<span className="note">{unscoped} pools with no row filter</span>:null}</div>
 <div id={id} hidden={!state.open}>{state.open?<><div className="interp">{page(inherited,state.page)}</div>{inherited.length>50?<div className="filters"><Button variant="ghost" disabled={!state.page} onClick={()=>store.setState({page:state.page-1})}>Previous inherited pools</Button><Button variant="ghost" disabled={(state.page+1)*50>=inherited.length} onClick={()=>store.setState({page:state.page+1})}>Next inherited pools</Button></div>:null}</>:null}</div></section>;
}

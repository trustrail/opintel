import {useEffect,useLayoutEffect,useMemo,useRef,useId,useSyncExternalStore} from 'react';
import {createPortal} from 'react-dom';
import {createStore,useStore} from 'zustand';
import {Mark} from './marks.js';
const subscribe=(notify:()=>void)=>{const media=window.matchMedia('(max-width:599px)');media.addEventListener('change',notify);return()=>media.removeEventListener('change',notify);};
const isNarrow=()=>window.matchMedia('(max-width:599px)').matches;
export type TreatmentValue='clear'|'masked'|'aggregate_only'|'tokenized'|'withheld'|'undecided';
export function treatmentLabel(value:TreatmentValue){return value==='clear'?'In the clear':value.replaceAll('_',' ').replace(/^./u,c=>c.toUpperCase());}
export function TreatmentIndicator({value}:{value:TreatmentValue}){
 const narrow=useSyncExternalStore(subscribe,isNarrow,()=>false);
 const label=treatmentLabel(value),name=`treatment-${value==='aggregate_only'?'aggregate':value}` as const,id=useId();
 const store=useMemo(()=>createStore<{open:boolean;left:number;top:number}>(()=>({open:false,left:0,top:0})),[]),state=useStore(store);
 const trigger=useRef<HTMLButtonElement>(null),popup=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{if(!state.open||!trigger.current||!popup.current)return;const a=trigger.current.getBoundingClientRect(),p=popup.current.getBoundingClientRect();const left=Math.max(8,Math.min(a.right+8,innerWidth-p.width-8)),top=Math.max(8,Math.min(a.top,innerHeight-p.height-8));store.setState({left,top});},[state.open,store,label]);
 useEffect(()=>{if(!state.open)return;const dismiss=(event:PointerEvent)=>{if(trigger.current?.contains(event.target as Node))return;store.setState({open:false});};const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){store.setState({open:false});trigger.current?.focus();}};const close=()=>store.setState({open:false});document.addEventListener('pointerdown',dismiss,true);document.addEventListener('keydown',key);window.addEventListener('scroll',close,true);window.addEventListener('resize',close);return()=>{document.removeEventListener('pointerdown',dismiss,true);document.removeEventListener('keydown',key);window.removeEventListener('scroll',close,true);window.removeEventListener('resize',close);};},[state.open,store]);
 const root=document.getElementById('opintel-app');
 return <span data-part="treatment-meaning">{!narrow?<span data-part="treatment-visible"><Mark name={name} size={17} label={label}/><span>{label}</span></span>:<button ref={trigger} type="button" className="toolchip" data-treatment-trigger aria-label={`Show treatment: ${label}`} title={label} aria-expanded={state.open} aria-controls={id} onClick={()=>store.setState({open:!state.open})}><Mark name={name} size={17} label={label}/></button>}{root?createPortal(<div ref={popup} id={id} className={state.open?'pop on':'pop'} data-purpose="treatment-name" hidden={!state.open} style={{left:state.left,top:state.top}}>{label}</div>,root):null}</span>;
}

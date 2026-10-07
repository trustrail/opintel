import type {PropsWithChildren, ReactNode} from 'react';

/** Presentational, controlled patterns. Screen-local stores own interaction state. */
export function FindingGrid({children}:PropsWithChildren){
 return <div className="tiles" data-layout="findings">{children}</div>;
}
export function FindingCard({title,children,footer,needsDecision=false}:PropsWithChildren<{title:string;footer:ReactNode;needsDecision?:boolean}>){
 return <article className="card" data-layout="finding" data-state={needsDecision?'decision':undefined}><header className="card-h"><h2>{title}</h2></header><div data-part="body">{children}</div><footer data-part="footer">{footer}</footer></article>;
}
export type FilterOption<T extends string>={value:T;label:string;count?:number;disabled?:boolean};
export function SegmentedFilters<T extends string>({label,value,options,onChange}: {label:string;value:T;options:readonly FilterOption<T>[];onChange:(value:T)=>void}){
 return <div className="segbtns" data-density="compact" role="group" aria-label={label}>{options.map(option=><button key={option.value} type="button" aria-pressed={value===option.value} disabled={option.disabled} onClick={()=>onChange(option.value)}>{option.label}{option.count===undefined?null:<span className="g">{option.count}</span>}</button>)}</div>;
}
export function DenseList({children,label,kindScope}:PropsWithChildren<{label:string;kindScope:'uniform'|'mixed'}>){
 return <div role="list" aria-label={label} data-mark-list={kindScope}>{children}</div>;
}
export type DenseRowProps={kind:string;identity:ReactNode;metadata?:ReactNode;actions?:ReactNode};
export function DenseRow({kind,identity,metadata,actions}:DenseRowProps){
 return <div className="rec" data-density="dense" role="listitem" data-mark-row="true" data-row-kind={kind}><div className="rhead"><div data-part="identity">{identity}</div><div className="rmeta">{metadata}</div><div>{actions}</div></div></div>;
}
export function GroupedRow({kind='element',selection,identity,type,signal,actions,expansion}:Omit<DenseRowProps,'metadata'> & {selection:ReactNode;type:ReactNode;signal?:ReactNode;expansion?:ReactNode}){
 return <div className="trow" data-layout="grouped" role="listitem" data-mark-row="true" data-row-kind={kind}>{selection}<div data-part="identity">{identity}</div><div data-part="secondary" className="type">{type}</div><div data-part="secondary" className="meta">{signal}</div><div data-part="secondary">{actions}</div>{expansion}</div>;
}
export function InlineExpansion({kind,identity,metadata,id,label,open,onToggle,children}:PropsWithChildren<Omit<DenseRowProps,'actions'> & {id:string;label:string;open:boolean;onToggle:()=>void}>){
 // Do not mount sensitive detail while closed: consumers fetch arguments only
 // while open and retain Activity's existing zero-retention cache policy.
 return <div className={open?'rec open':'rec'} data-density="dense" role="listitem" data-mark-row="true" data-row-kind={kind}><div className="rhead"><div data-part="identity">{identity}</div><div className="rmeta">{metadata}</div><button className="toolchip" type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>{label}</button></div><div className="rdetail" id={id} hidden={!open}>{open?children:null}</div></div>;
}
export function WeightedActionBar({count,consequence,children}:PropsWithChildren<{count:ReactNode;consequence:ReactNode}>){
 return <div className="bulkbar on" data-layout="weighted" role="group" aria-label="Selected decisions"><div className="n">{count}</div><div data-part="consequence">{consequence}</div>{children}</div>;
}
export function RelationshipBand({left,right}: {left:ReactNode;right:ReactNode}){
 return <div className="joinbox" data-layout="pair"><div data-part="identity">{left}</div><span aria-hidden="true">↔</span><div data-part="identity">{right}</div></div>;
}

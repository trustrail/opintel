import {Mark} from './marks.js';
export {Mark,markNames,type MarkName,type MarkSize} from './marks.js';
import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import './styles.js';
import { useMemo } from 'react';
import { createStore, useStore } from 'zustand';

function classNames(...classes: Array<string | undefined>): string {
  return classes.filter((name): name is string => name !== undefined && name.length > 0).join(' ');
}

export function AppRoot({ children }: PropsWithChildren): ReactNode {
  return <div id="opintel-app">{children}</div>;
}

export type ButtonVariant = 'primary' | 'go' | 'ghost';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = 'primary', className, type = 'button', ...props }: ButtonProps): ReactNode {
  return <button {...props} className={classNames('btn', variant === 'primary' ? undefined : variant, className)} type={type} />;
}

export type CardProps = PropsWithChildren<{ className?: string }>;

export function Card({ children, className }: CardProps): ReactNode {
  return <section className={classNames('card', className)}>{children}</section>;
}

export type CardHeaderProps = PropsWithChildren<{
  title: string;
  meta?: string;
}>;

export function CardHeader({ title, meta, children }: CardHeaderProps): ReactNode {
  return <header className="card-h"><h2>{title}</h2>{meta === undefined ? children : <span className="meta">{meta}</span>}</header>;
}

export type TreatmentKind = 'clear' | 'tokenized' | 'masked' | 'reference' | 'aggregate' | 'withheld' | 'undecided';

const treatmentClass: Readonly<Record<TreatmentKind, string>> = {
  clear: 'clear',
  tokenized: 'token',
  masked: 'mask',
  reference: 'ref',
  aggregate: 'agg',
  withheld: 'held',
  undecided: 'wait',
};

const treatmentLabel: Readonly<Record<TreatmentKind, string>> = {
  clear: 'In the clear',
  tokenized: 'Tokenized',
  masked: 'Masked',
  reference: 'By reference',
  aggregate: 'Aggregate only',
  withheld: 'Withheld',
  undecided: 'Needs a decision',
};

export function Treatment({ kind, label }: { kind: TreatmentKind; label?: string }): ReactNode {
  return <span className={classNames('tr', treatmentClass[kind])}>{kind==='reference'?null:<Mark name={`treatment-${kind}`} size={16}/ >}{label ?? treatmentLabel[kind]}</span>;
}

export type EmptyStateProps = PropsWithChildren<{
  /** Contextual error/loading affordances only; never a screen identity. */
  icon?: '!' | '…';
  title: string;
  description: string;
  calm?: boolean;
}>;

export function EmptyState({ icon, title, description, calm = false, children }: EmptyStateProps): ReactNode {
  return <section className={classNames('blank', calm ? 'calm' : undefined)}>{icon==='!'||icon==='…'?<div className="bi" aria-hidden="true">{icon}</div>:null}<b>{title}</b><p>{description}</p>{children}</section>;
}

export type ErrorStateProps = {
  title: string;
  description: string;
  retry: () => void | Promise<unknown>;
};

export function ErrorState({ title, description, retry }: ErrorStateProps): ReactNode {
  return <EmptyState icon="!" title={title} description={description}><AsyncButton variant="ghost" pendingLabel="Trying again…" run={async()=>retry()}>Try again</AsyncButton></EmptyState>;
}

export type StageStatus = 'wait' | 'run' | 'done' | 'stop';
export type Stage = { name: string; detail: string; status: StageStatus };

const stageMark: Readonly<Record<StageStatus, string>> = {
  wait: '', run: '', done: '✓', stop: '?',
};

export function StageRail({ title, elapsed, stages }: { title: string; elapsed: string; stages: readonly Stage[] }): ReactNode {
  return <section className="rail on" aria-live="polite"><header className="rhead"><b>{title}</b><span className="mono">{elapsed}</span></header><div className="stages">{stages.map((stage) => <div className={classNames('stg', stage.status)} key={stage.name}><div className="sn"><span className="dot">{stageMark[stage.status]}</span><b>{stage.name}</b></div><span>{stage.detail}</span></div>)}</div></section>;
}

export function LoadingState({ stages }: { stages?: readonly Stage[] }): ReactNode {
  return stages === undefined
    ? <EmptyState icon="…" title="Preparing this view" description="The information for this surface is being prepared." />
    : <StageRail title="Running" elapsed="0.0s" stages={stages} />;
}

// Local control state only; query results remain in TanStack Query.
export function AsyncButton({run,pendingLabel,children,disabled,refusal,...props}:Omit<ButtonProps,'onClick'> & {
  run:()=>Promise<unknown>; pendingLabel:string; refusal?:string|null;
}) {
  const store=useMemo(()=>createStore<{pending:boolean;error:string|null}>(()=>({pending:false,error:null})),[]);
  const state=useStore(store);
  async function start(){
    if(store.getState().pending||disabled)return;
    store.setState({pending:true,error:null});
    try{
      const result=await run();
      for(const item of Array.isArray(result)?result:[result]){
        if(typeof item==='object'&&item!==null&&'isError' in item&&item.isError&&'error' in item)throw item.error;
      }
    }catch(error){
      store.setState({error:typeof error==='object'&&error!==null&&'message' in error&&typeof error.message==='string'?error.message:'The action could not be completed. Try again.'});
    }finally{store.setState({pending:false});}
  }
  const message=refusal===undefined?state.error:refusal;
  return <span><Button {...props} disabled={disabled||state.pending} aria-busy={state.pending} onClick={()=>{void start();}}>{state.pending?pendingLabel:children}</Button>{message?<span className="note" role="alert" style={{display:'block'}}>{message}</span>:null}</span>;
}

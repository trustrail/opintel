import type {ReactNode} from 'react';
import {KindIcon,type Kind,Tip} from './kind.js';
/** Shared kind chip; the label is always a server name, never an internal id. */
export function KindChip({kind,name,children,title,kindLabel}:{kindLabel?:string;kind:Kind;name:string;children?:ReactNode;title?:string}){const chip=<span data-kind-chip><KindIcon kind={kind} label={kindLabel}/><span>{name}</span>{children}</span>;return <Tip label={title??`${kind.replaceAll('_',' ')} · ${name}`}>{chip}</Tip>;}

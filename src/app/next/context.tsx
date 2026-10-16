import {createContext,useContext,type ReactNode} from 'react';
import {nextHref,type Destination,type NextSearch} from './state.js';
export type NextContextValue={projectId:string;destination:Destination;search:NextSearch;admin:boolean;clearDirty:()=>void;go:(destination:Destination,search?:NextSearch,replace?:boolean)=>void};
export const NextContext=createContext<NextContextValue|null>(null);
export function useNext(){const ctx=useContext(NextContext);if(!ctx)throw new Error('Next console context missing');return ctx;}
export function NextLink({to,search={},children}:{to:Destination;search?:NextSearch;children:ReactNode}){const {projectId}=useNext();return <a href={nextHref(projectId,to,search)}>{children}</a>;}

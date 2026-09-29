import {createStore} from 'zustand/vanilla';
import type {PoolKeyCreationResponse} from '../../shared/api/pool-keys.js';
export function createPoolUi(){return createStore<{
 action:'create'|'rotate'|'revoke'|null;version:string;requestKey:string;issued:PoolKeyCreationResponse|null;copied:boolean;copyError:string|null;
 open:(action:'create'|'rotate'|'revoke',version?:string)=>void;close:()=>void;receive:(r:PoolKeyCreationResponse)=>void;copy:(ok:boolean)=>void;dismiss:()=>void;
}>(set=>({action:null,version:'',requestKey:'',issued:null,copied:false,copyError:null,
 open:(action,version='')=>set({action,version,requestKey:crypto.randomUUID()}),close:()=>set({action:null}),
 receive:issued=>set({action:null,issued,copied:false,copyError:null}),copy:ok=>set(ok?{copied:true,copyError:null}:{copyError:'Copy failed. Try again or select the key and copy it with your keyboard.'}),
 dismiss:()=>set(s=>s.issued?.keyShown&&!s.copied?{}:{issued:null,copied:false,copyError:null}),
 }));}

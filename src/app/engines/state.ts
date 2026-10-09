import {create} from 'zustand';
export const useEngineDisclosure=create<{expanded:Record<string,boolean>;toggle(key:string):void;close(key:string):void}>(set=>({expanded:{},toggle:key=>set(s=>({expanded:{...s.expanded,[key]:!s.expanded[key]}})),close:key=>set(s=>({expanded:{...s.expanded,[key]:false}}))}));

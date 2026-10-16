import {useEffect,useRef,type ReactNode} from 'react';
/** A modal using the reviewed sheet pattern; it makes every background branch inert. */
export function DraftDialog({children}:{children:ReactNode}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{const previous=document.activeElement,dialog=ref.current;const changed:Element[]=[];let branch:Element|null=dialog?.parentElement??null;while(branch&&branch!==document.body){for(const sibling of branch.parentElement?.children??[])if(sibling!==branch&&!sibling.hasAttribute('inert')){sibling.setAttribute('inert','');changed.push(sibling);}branch=branch.parentElement;}dialog?.focus();return()=>{changed.forEach(e=>e.removeAttribute('inert'));if(previous instanceof HTMLElement)previous.focus();};},[]);
 return <div className="modal on"><div className="sheet" ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Unsaved work" onKeyDown={e=>{if(e.key!=='Tab')return;const controls=[...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')],first=controls[0],last=controls.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first?.focus();}}}><h2>Unsaved work</h2>{children}</div></div>;
}

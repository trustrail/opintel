import {KindChip} from '../components/chip.js';
import {TreatmentMark} from '../components/treatment.js';
import {useQuery} from '@tanstack/react-query';
import {useState,useId} from 'react';
import {provenanceDetail,type Provenance} from '../../shared/api/provenance.js';
import {Dialog} from '../components/primitives.js';
import {CopyName} from '../components/copy-name.js';
import {Glyph} from '../components/kind.js';
import {ListState} from '../home/screen.js';
export const provenanceKeys={detail:(project:string,id:string)=>['console-next','project',project,'provenance',id] as const};
export function ProvenanceBody({record}:{record:Provenance}){
 const prefix=useId(),[expanded,setExpanded]=useState<string[]>(['request']);
 return <ol data-connect-fields aria-label="Recorded provenance chain">{record.steps.map((step,i)=><li key={step.kind} data-connect-fields><button data-action aria-controls={prefix+step.kind} aria-expanded={expanded.includes(step.kind)} onClick={()=>setExpanded(values=>values.includes(step.kind)?values.filter(v=>v!==step.kind):[...values,step.kind])}><Glyph name={expanded.includes(step.kind)?'check':'chevron'}/>{i+1}. {step.title} <span data-badge>{step.recorded?'recorded':'not recorded'}</span></button><dl id={prefix+step.kind} hidden={!expanded.includes(step.kind)}>{step.facts.map(f=><div key={f.key}><dt>{f.label}</dt><dd>{f.recorded?<>{f.link?<a href={f.link}>{f.value}</a>:f.key==='certificate'?<span data-agent-identity><code>{f.value}</code></span>:f.key==='nickname'?<small>{f.value}</small>:f.key==='verification'?<span data-badge>{f.value}</span>:f.key.startsWith('column:')&&['clear','tokenized','masked','aggregate_only','custody','withheld','undecided'].includes(f.value??'')?<KindChip kind="column" name={f.label}><TreatmentMark kind={f.value as 'clear'|'tokenized'|'masked'|'aggregate_only'|'custody'|'withheld'|'undecided'}/></KindChip>:f.key.startsWith('state:')?<span data-badge>{f.value}</span>:<span>{f.value}</span>}{f.copyable&&f.value&&<CopyName name={f.value} compact/>}</>:<span>{f.key==='certificate'?'certificate not recorded':'not recorded'}</span>}</dd></div>)}</dl></li>)}</ol>;
}
export function ProvenancePanel({project,id}:{project:string;id:string}){
 const [open,setOpen]=useState(true),query=useQuery({queryKey:provenanceKeys.detail(project,id),queryFn:async()=>{const result=await provenanceDetail(project,id);if(!result.ok)throw result.error;return result.value;},retry:false});
 return <Dialog.Root open={open} onOpenChange={setOpen}><Dialog.Portal><Dialog.Overlay data-overlay/><Dialog.Content data-dialog data-create-pool><header><span><Dialog.Title>Provenance</Dialog.Title><Dialog.Description>Stored records only. Missing historical facts are not reconstructed from today's configuration.</Dialog.Description></span></header><div data-create-scroll>{query.isPending?<ListState state="loading"/>:query.isError?<ListState state="error" error={query.error} retry={()=>{void query.refetch();}}/>:<ProvenanceBody record={query.data}/>}</div><Dialog.Close data-close aria-label="Close provenance"><Glyph name="close"/></Dialog.Close></Dialog.Content></Dialog.Portal></Dialog.Root>;
}

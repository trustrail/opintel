import {useState} from 'react';
import {useQuery,useMutation} from '@tanstack/react-query';
import {DemoTemplateList,SourceListItem} from '../../shared/api/source-schemas.js';
import {createApiClient} from '../../shared/api/client.js';
import {Glyph,KindIcon} from '../components/kind.js';
import {useProjects,read} from '../home/data.js';
import {ListState} from '../home/screen.js';
import {dataKeys,useRefreshData} from './data.js';
import type {z} from 'zod';
export function DemoPacks({project,onConnected}:{project:string;onConnected:(source:z.infer<typeof SourceListItem>)=>void}){
 const projects=useProjects(),industry=projects.data?.find(p=>p.id===project)?.industry.id,[open,setOpen]=useState(false),refresh=useRefreshData(project);
 const packs=useQuery({queryKey:dataKeys.demos(project,industry??''),enabled:Boolean(industry),retry:false,queryFn:()=>read(createApiClient(),`/api/v1/industries/${industry}/demo-sources?projectId=${project}`,DemoTemplateList)});
 const connect=useMutation({retry:false,mutationFn:async(id:string)=>{const r=await createApiClient().request({path:`/api/v1/projects/${project}/sources/from-demo`,method:'POST',body:{demoTemplateId:id},response:SourceListItem});if(!r.ok)throw r.error;await refresh();onConnected(r.value);}}),prepared=packs.data?.filter(p=>p.prepared)??[];
 if(!prepared.length)return null;
 return <section data-demo-packs><button type="button" aria-expanded={open} aria-controls={'demo-packs-'+project} onClick={()=>setOpen(!open)}><Glyph name="source"/>Use the demo data instead</button><ul id={'demo-packs-'+project} hidden={!open}>{prepared.map(p=><li key={p.id}><span><KindIcon kind="source"/><strong>{p.name}</strong></span>{p.connected?<span data-badge data-status="ok">Connected</span>:<button type="button" disabled={connect.isPending} onClick={()=>connect.mutate(p.id)}>Connect</button>}</li>)}</ul>{connect.isError&&<ListState state="error" error={connect.error}/>}</section>;
}

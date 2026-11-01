import {useState} from 'react';
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query';
import {createApiClient} from '../../shared/api/client.js';
import {SourceSchemas,SourceListItem,type SourceItem} from '../../shared/api/source-schemas.js';
import {Checkbox} from '../components/primitives.js';
import {Glyph} from '../components/kind.js';
import {Message} from '../pools/commands.js';
import {dataKeys,useRefreshData} from './data.js';
export function SchemaPicker({project,source,onSaved}:{project:string;source:SourceItem;onSaved?:()=>void}){
 const [selection,setSelection]=useState<string[]|null>(null),refresh=useRefreshData(project),cache=useQueryClient(),waiting=source.status==='pending_egress'||source.status==='unreachable'||!source.engineId;
 const query=useQuery({queryKey:dataKeys.schemas(project,source.id),enabled:!waiting,retry:false,queryFn:async({signal})=>{const result=await createApiClient(undefined,{signal}).request({path:`/api/v1/sources/${source.id}/schemas?projectId=${project}`,response:SourceSchemas});if(!result.ok)throw result.error;return result.value;}});
 const chosen=(selection??query.data?.included??[]).filter(name=>query.data?.schemas.includes(name));
 const save=useMutation({retry:false,mutationFn:async()=>{const result=await createApiClient().request({path:`/api/v1/sources/${source.id}/schemas`,method:'PUT',body:{projectId:project,includeSchemas:chosen},response:SourceListItem});if(!result.ok)throw result.error;await refresh();await cache.invalidateQueries({queryKey:dataKeys.schemas(project,source.id)});onSaved?.();}});
 return <section data-connect-fields aria-label="Schema selection"><h3>Choose schemas</h3>{waiting?<p role="status">Waiting for the engine to apply this source’s network policy.</p>:query.isPending?<p role="status">Listing schemas…</p>:query.isError?<><Message error={query.error}/><button type="button" onClick={()=>{void query.refetch();}}>Retry schema listing</button></>:!query.data.schemas.length?<p role="status">The source has no schemas you can include.</p>:<>{query.data.schemas.map(name=><label data-check key={name}><Checkbox.Root aria-label={`Include schema ${name}`} checked={chosen.includes(name)} onCheckedChange={v=>setSelection(v===true?[...chosen,name]:chosen.filter(n=>n!==name))}><Checkbox.Indicator><Glyph name="check" size={16}/></Checkbox.Indicator></Checkbox.Root>{name}</label>)}<button data-primary type="button" disabled={!chosen.length||save.isPending} onClick={()=>save.mutate()}>{save.isPending?'Saving…':'Save schemas and scan'}</button></>}{save.isError&&<Message error={save.error}/>}</section>;
}

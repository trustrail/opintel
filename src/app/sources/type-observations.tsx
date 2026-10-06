import {Mark} from '../../shared/ui/index.js';
import {Link} from '@tanstack/react-router';
import {ErrorState,LoadingState} from '../../shared/ui/index.js';
import {Timestamp} from '../settings/preferences.js';
import {useTypeObservations} from './data.js';
export function TypeObservations({projectId}:{projectId:string}){
 const query=useTypeObservations(projectId);
 if(query.isPending)return <LoadingState/>;
 if(query.isError)return <ErrorState title="Source type observations could not be loaded" description={query.error.message} retry={()=>query.refetch()}/>;
 if(!query.data.length)return null;
 return <section className="card" aria-label="Unmapped source types"><div className="card-h"><h2>Unmapped source types</h2></div><ul data-mark-list="uniform" className="feed">{query.data.map(item=><li data-mark-row="true" data-row-kind="finding" key={`${item.sourceId}:${item.sourceType}`}><span className="sev hi" aria-hidden="true"><Mark name="needs-a-decision" size={18}/></span><div className="fb"><p className="t">{item.sourceName}: <code>{item.sourceType}</code></p><p className="d">{item.elementCount} unsupported {item.elementCount===1?'element':'elements'}. Opintel has no mapping for this source type. This is an Opintel mapping gap, not a problem with your data. These elements cannot receive access decisions.</p><Timestamp value={item.observedAt} appearance="when"/>{' · '}<Link to="/projects/$projectId/introspections/$runId" params={{projectId,runId:item.runId}}>View introspection</Link></div></li>)}</ul></section>;
}

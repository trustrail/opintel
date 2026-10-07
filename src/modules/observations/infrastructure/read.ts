import {withTenant} from '../../../platform/db/scope.js';
import {ok} from '../../../shared/kernel/index.js';
import {ObservationPage,ObservationMemberPage} from '../../../shared/api/observations.js';
import type {ObservationReader} from '../application/read.js';
const time=(value:string)=>`to_char(${value} AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
// No local reasons, arrival payloads, source values, sentinel tokens or SQL.
// Pending retries do not close a quarantine. Only a landed notice does that.
const current=`WITH latest AS (
 SELECT DISTINCT ON(kind,cause,cause_detail,entity_id) *,kind||':'||cause||':'||cause_detail AS group_id
 FROM observation_event WHERE (kind='custody')=$1 ORDER BY kind,cause,cause_detail,entity_id,id DESC
), current AS (
 SELECT l.*,COALESCE((SELECT min(h.observed_at) FROM observation_event h WHERE h.kind=l.kind AND h.cause=l.cause AND h.cause_detail=l.cause_detail AND h.entity_id=l.entity_id AND h.state='open'
  AND h.id>COALESCE((SELECT max(closed.id) FROM observation_event closed WHERE closed.kind=l.kind AND closed.cause=l.cause AND closed.cause_detail=l.cause_detail AND closed.entity_id=l.entity_id AND closed.state='resolved' AND closed.id<l.id),0)),l.observed_at) AS first_at
 FROM latest l WHERE l.kind<>'filing' OR l.state='resolved' OR NOT EXISTS(
  SELECT 1 FROM observation_event newer WHERE newer.kind='filing' AND newer.entity_id=l.entity_id AND newer.id>l.id AND newer.state='open')
)`;
export class PostgresObservationReader implements ObservationReader {
 groups(...[ctx,scope,after,limit]:Parameters<ObservationReader['groups']>){return withTenant(ctx,async tx=>{
  const [row]=await tx.query<{items:unknown;counts:unknown}>(`${current},groups AS (
   SELECT group_id AS id,kind,cause,cause_detail AS "causeDetail",state,count(*)::int AS count,${time('min(first_at)')} AS "oldestAt",${time('max(observed_at)')} AS "latestAt"
   FROM current GROUP BY group_id,kind,cause,cause_detail,state
  ),page AS(SELECT * FROM groups WHERE state=$2 AND ($3::text IS NULL OR id COLLATE "C">$3 COLLATE "C") ORDER BY id COLLATE "C" LIMIT $4)
  SELECT COALESCE((SELECT jsonb_agg(p ORDER BY p.id COLLATE "C") FROM page p),'[]') AS items,
  jsonb_build_object('open',(SELECT COALESCE(sum(count),0)::int FROM groups WHERE state='open'),'resolved',(SELECT COALESCE(sum(count),0)::int FROM groups WHERE state='resolved')) AS counts`,[scope.custody,scope.view,after,limit+1]);
  const parsed=ObservationPage.parse({...row,nextCursor:null}),items=parsed.items.slice(0,limit);return ok({...parsed,items,nextCursor:parsed.items.length>limit?items.at(-1)!.id:null});
 });}
 members(...[ctx,scope,group,after,limit]:Parameters<ObservationReader['members']>){return withTenant(ctx,async tx=>{
  const rows=await tx.query(`${current} SELECT entity_id AS id,kind,state,
   ${time('first_at')} AS "observedAt",
   CASE WHEN state='resolved' THEN ${time('observed_at')} END AS "resolvedAt",resolution,CASE WHEN kind='custody' THEN metadata||jsonb_build_object('keyState',(SELECT v.state FROM token_key_version v WHERE v.version=c.entity_id::int)) ELSE metadata END AS metadata,
   (SELECT jsonb_agg(jsonb_build_object('at',${time('h.recorded_at')},'state',h.state,'cause',h.cause,'resolution',h.resolution) ORDER BY h.id) FROM observation_event h WHERE h.kind=c.kind AND h.entity_id=c.entity_id) AS history
   FROM current c WHERE group_id=$2 AND state=$3 AND ($4::text IS NULL OR entity_id COLLATE "C">$4 COLLATE "C") ORDER BY entity_id COLLATE "C" LIMIT $5`,[scope.custody,group,scope.view,after,limit+1]);
  const parsed=ObservationMemberPage.parse({items:rows,nextCursor:null}),items=parsed.items.slice(0,limit);return ok({items,nextCursor:parsed.items.length>limit?items.at(-1)!.id:null});
 });}
}

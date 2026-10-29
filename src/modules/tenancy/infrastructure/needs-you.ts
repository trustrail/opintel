import {z} from 'zod';
import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ok,err,DomainError} from '../../../shared/kernel/index.js';
import {NeedsYouItem} from '../../../shared/api/needs-you.js';
import {readSetting,projectSettingDefinitions} from '../../../shared/project-settings.js';
import {quarantineLabels} from '../../../shared/observation-copy.js';
import {custodyAvailability} from '../../release-custody/index.js';
import type {NeedsYouReader} from '../application/needs-you.js';
/** No independent work-item store: facts disappear only when their owning
 * decisions/checks change. Stable keyset ordering never uses an offset. */
export class PostgresNeedsYouReader implements NeedsYouReader {
 async read(...[ctx,admin,after,limit]:Parameters<NeedsYouReader['read']>){
  const [project]=await withPlatform(tx=>tx.query<{settings:unknown;custody_check:unknown}>('SELECT settings,custody_check FROM project WHERE id=$1',[ctx.projectId]));
  if(!project)return err(new DomainError('not_found','The project was not found.'));
  const required=['query.timeoutSeconds','query.rowLimit','query.memoryLimitMb','query.concurrencyPerPool',...(readSetting(project.settings,'discovery.valueSampling')===true?['discovery.sampleSize']:[]),...(readSetting(project.settings,'custody.provider')==='xq'?['custody.tenant']:[])];
  const settings=required.filter(path=>readSetting(project.settings,path)===undefined||readSetting(project.settings,path)===null||readSetting(project.settings,path)==='').map(path=>({id:'setting:'+path,kind:'setting_required',title:projectSettingDefinitions.find(d=>d.path===path)!.label+' needs a value',count:1,targetRoute:`/projects/${ctx.projectId}/${path.startsWith('query.')?'settings-query':path.startsWith('discovery.')?'settings-discovery':'settings-project'}`,roles:['admin']}));
  const custody=await custodyAvailability(ctx.projectId);
  const custodyTitle=custody.reason==='provider_not_configured'?'Configure a custody provider':custody.reason==='provider_configuration_changed'?'Recheck the changed custody provider configuration':custody.reason==='provider_check_failed'?'Custody provider connection check failed':'Check the custody provider connection';
  const checks=custody.available?[]:[{id:'check:custody-provider',kind:custody.reason==='provider_check_failed'?'check_failed':'check_required',title:custodyTitle,count:1,targetRoute:`/projects/${ctx.projectId}/settings-project`,roles:['admin']}];
  if(custody.configuration?.provider==='xq'){
   const check=z.object({dashboard:z.object({status:z.enum(['authenticated','failed','not_set'])}).nullable().optional()}).safeParse(project.custody_check);
   const status=check.success?check.data.dashboard?.status:undefined;
   if(status!=='authenticated')checks.push({id:'check:xq-dashboard',kind:status==='failed'?'check_failed':'check_required',title:'Check the XQ dashboard key',count:1,targetRoute:`/projects/${ctx.projectId}/settings-project`,roles:['admin']});
  }
  return withTenant(ctx,async tx=>{
   const rows=await tx.query<{item:unknown}>(`WITH undecided AS (
    SELECT p.id AS pool_id,p.name AS pool_name,CASE WHEN e.exposed_name IS NULL THEN 'element:'||e.id ELSE 'name:'||e.exposed_name END AS group_key,COALESCE(e.exposed_name,'Unnameable element') AS name,count(*)::int AS count
    FROM pool p JOIN pool_source_binding b ON b.pool_id=p.id JOIN data_source s ON s.id=b.source_id AND s.status<>'archived'
    JOIN catalog_object o ON o.source_id=s.id AND o.status='active' JOIN catalog_element e ON e.object_id=o.id AND e.status='active'
    LEFT JOIN entitlement t ON t.pool_id=p.id AND t.element_id=e.id WHERE public.pool_table_allowed(p.id,o.id) AND t.element_id IS NULL GROUP BY p.id,p.name,group_key,e.exposed_name
   ), latest_observation AS (
    SELECT DISTINCT ON(kind,cause,cause_detail,entity_id) *,kind||':'||cause||':'||cause_detail AS group_id FROM observation_event
    WHERE kind<>'custody' OR $3::boolean ORDER BY kind,cause,cause_detail,entity_id,id DESC
   ), observations AS (
    SELECT l.* FROM latest_observation l WHERE state='open' AND (kind<>'filing' OR NOT EXISTS(SELECT 1 FROM observation_event n WHERE n.kind='filing' AND n.entity_id=l.entity_id AND n.id>l.id AND n.state='open'))
   ), suggestions AS (
    SELECT (array_agg(c.id ORDER BY c.attempted_at,c.id))[1] AS id,LEAST(left_element_id,right_element_id) AS l,GREATEST(left_element_id,right_element_id) AS r,(array_agg(CASE WHEN c.left_element_id<c.right_element_id THEN c.left_name ELSE c.right_name END ORDER BY c.attempted_at DESC,c.id DESC))[1] AS left_name,(array_agg(CASE WHEN c.left_element_id<c.right_element_id THEN c.right_name ELSE c.left_name END ORDER BY c.attempted_at DESC,c.id DESC))[1] AS right_name FROM token_join_candidate c GROUP BY LEAST(left_element_id,right_element_id),GREATEST(left_element_id,right_element_id)
   ), findings AS (
    SELECT 'entitlement:'||pool_id||':'||group_key AS id,'undecided_entitlement' AS kind,name||' — '||pool_name AS title,count,'/projects/'||$4||'/entitlements?poolId='||pool_id AS target,ARRAY['admin'] AS roles FROM undecided
    UNION ALL SELECT 'row:'||p.id||':'||o.id,'missing_row_decision','Set rows — '||o.exposed_name||' — '||p.name,1,'/projects/'||$4||'/entitlements?poolId='||p.id||'&rowObjectId='||o.id,ARRAY['admin'] FROM catalog_object o JOIN pool_source_binding b ON b.source_id=o.source_id JOIN pool p ON p.id=b.pool_id JOIN data_source s ON s.id=o.source_id AND s.status<>'archived' WHERE o.status='active' AND public.pool_table_allowed(p.id,o.id) AND ((p.tables_explicit AND NOT EXISTS(SELECT 1 FROM row_entitlement d WHERE d.object_id=o.id AND d.pool_id=p.id AND d.level='pool_override')) OR (NOT p.tables_explicit AND EXISTS(SELECT 1 FROM row_entitlement d WHERE d.object_id=o.id) AND NOT EXISTS(SELECT 1 FROM row_entitlement d WHERE d.object_id=o.id AND (d.level='object_default' OR d.pool_id=p.id))))
    UNION ALL SELECT 'suggestion:'||g.id,'suggestion','Review tokens: '||g.left_name||' ↔ '||g.right_name,1,'/projects/'||$4||'/relationship-suggestions?elementId='||g.l,ARRAY['admin'] FROM suggestions g LEFT JOIN LATERAL(SELECT action FROM token_join_review h WHERE h.left_element_id=g.l AND h.right_element_id=g.r ORDER BY reviewed_at DESC,id DESC LIMIT 1) h ON true WHERE COALESCE(h.action,'pending') IN ('pending','not_sure')
    UNION ALL SELECT 'observation:'||group_id,'observation',CASE WHEN kind='filing' THEN COALESCE($6::jsonb->>cause,'The filing needs local review before it can land.') WHEN kind='type' THEN 'A source type has no mapping: '||cause_detail WHEN cause='custody_mismatch' THEN 'Escrow does not match the recorded key' ELSE 'Escrow could not be verified' END,count(*)::int,'/projects/'||$4||CASE WHEN kind='custody' THEN '/token-key' ELSE '/observations' END,CASE WHEN kind='custody' THEN ARRAY['admin'] ELSE ARRAY['admin','operator'] END FROM observations GROUP BY group_id,kind,cause,cause_detail
    UNION ALL SELECT 'check:engine:'||id,CASE WHEN health IN ('unavailable','contract_mismatch') THEN 'check_failed' ELSE 'check_required' END,'Verify engine: '||name,1,'/projects/'||$4||'/settings-engines',ARRAY['admin'] FROM engine WHERE verified_at IS NULL OR health<>'healthy'
    UNION ALL SELECT 'check:engine-required','check_required','Register an engine',1,'/projects/'||$4||'/settings-engines',ARRAY['admin'] WHERE NOT EXISTS(SELECT 1 FROM engine)
    UNION ALL SELECT 'check:source:'||s.id,'check_failed','Check source: '||s.name,1,'/projects/'||$4||'/data-sources',ARRAY['admin'] FROM data_source s LEFT JOIN LATERAL(SELECT state FROM introspection_run r WHERE r.source_id=s.id ORDER BY created_at DESC,id DESC LIMIT 1) r ON true WHERE s.status<>'archived' AND (s.status IN ('unreachable','introspection_failed','failed','unavailable') OR r.state='failed')
    UNION ALL SELECT 'check:token-key:'||version,CASE WHEN last_rehearsal IN ('mismatch','failed') THEN 'check_failed' ELSE 'check_required' END,'Verify token-key backup',1,'/projects/'||$4||'/token-key',ARRAY['admin'] FROM token_key_version WHERE $3::boolean AND state='current' AND (backup_verified_at IS NULL OR last_rehearsal IS DISTINCT FROM 'ok')
    UNION ALL SELECT x->>'id',x->>'kind',x->>'title',(x->>'count')::int,x->>'targetRoute',ARRAY['admin'] FROM jsonb_array_elements($5::jsonb) x
   ) SELECT jsonb_build_object('id',id,'kind',kind,'title',title,'count',count,'targetRoute',target,'roles',roles) AS item FROM findings WHERE $1::text IS NULL OR id COLLATE "C">$1 COLLATE "C" ORDER BY id COLLATE "C" LIMIT $2`,[after,limit,admin,ctx.projectId,JSON.stringify([...settings,...checks]),JSON.stringify(quarantineLabels)]);
   return ok(rows.map(r=>NeedsYouItem.parse(r.item)));
  });
 }
}

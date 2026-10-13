import {withTenant,withPlatform} from '../../../platform/db/scope.js';
import {ColumnTags} from '../../../shared/api/column-tags.js';
import {DomainError,err,ok} from '../../../shared/kernel/index.js';
import type {ColumnTagRepository} from '../application/column-tags.js';
export class PostgresColumnTags implements ColumnTagRepository{
 async read(...[ctx,id]:Parameters<ColumnTagRepository['read']>){const found=await withTenant(ctx,async tx=>{
  const [row]=await tx.query<{tags:unknown;name:string}>('SELECT e.scope_tags AS tags,e.exposed_name AS name FROM catalog_element e WHERE e.id=$1 AND e.status=\'active\'',[id]);if(!row)return null;
  // Vocabulary remains a suggestion, not the authoritative tag binding.
  const terms=await tx.query<{name:string}>(`SELECT name FROM vocabulary_term WHERE project_id=$1 AND active AND (lower(name)=lower($2) OR lower(column_hint)=lower($2)) ORDER BY name LIMIT 20`,[ctx.projectId,row.name]);
  return {row,terms};
 });if(!found)return err(new DomainError('not_found','The catalogue column is unavailable.'));
 const industry=await withPlatform(tx=>tx.query<{name:string}>(`SELECT name FROM vocabulary_term WHERE industry_id=(SELECT industry_id FROM project WHERE id=$1) AND project_id IS NULL AND active AND (lower(name)=lower($2) OR lower(column_hint)=lower($2)) ORDER BY name LIMIT 20`,[ctx.projectId,found.row.name]));
 return ok(ColumnTags.parse({tags:found.row.tags,suggestions:[...new Set([...found.terms,...industry].map(t=>t.name))].sort().slice(0,20)}));}
 async save(...[ctx,id,tags]:Parameters<ColumnTagRepository['save']>){const exists=await this.read(ctx,id);if(!exists.ok)return exists;const updated=await withTenant(ctx,tx=>tx.query("UPDATE catalog_element SET scope_tags=$2 WHERE id=$1 AND status='active' RETURNING id",[id,JSON.stringify(tags)]));return updated.length?ok({...exists.value,tags}):err(new DomainError('not_found','The catalogue column is unavailable.'));}
}

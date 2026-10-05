import {domainMigrationConfirmation} from '../../../shared/token-domain.js';
import { withTenant, withPlatform } from '../../../platform/db/scope.js';
import { DomainError, err, ok, type ElementId, type SourceId } from '../../../shared/kernel/index.js';
import { DeclarationCommand, type DeclarationValues } from '../../../shared/api/declarations.js';
import type { DeclarationRepository, DeclarationCanonicalisers } from '../application/declarations.js';
import { effectiveDeclarations, tokenBehaviour } from '../application/declarations.js';
import { validateTokenDeclarations } from '../application/token-declarations.js';
import { sourceTimezone, validateTemporalType, validateTokenizedTemporal, type TemporalContext } from '../application/temporal.js';
import { validateCanonicaliserType } from '../application/canonicaliser-mode.js';
import type { ExposedType } from '../domain/type-mapping.js';
type Row = DeclarationValues & { elementId:ElementId;sourceId:SourceId;schemaName:string;qualifiedName:string;exposedType:ExposedType|null;schemaTimezone:string|null;tokenizedEntitlements:number };
const select=`SELECT e.id AS "elementId",o.source_id AS "sourceId",o.schema_name AS "schemaName",
 concat_ws('.',s.exposed_alias,o.exposed_schema,o.exposed_name,COALESCE(e.exposed_name,'[unnameable element]')) AS "qualifiedName",
 e.exposed_type AS "exposedType",e.token_domain AS "tokenDomain",e.case_insensitive AS "caseInsensitive",e.source_timezone AS "sourceTimezone",e.epoch_unit AS "epochUnit",e.canon_id AS "canonId",d.source_timezone AS "schemaTimezone",
 (SELECT count(*)::int FROM entitlement t WHERE t.element_id=e.id AND t.treatment='tokenized') AS "tokenizedEntitlements"
 FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id JOIN data_source s ON s.id=o.source_id
 LEFT JOIN catalog_schema_temporal d ON d.source_id=o.source_id AND d.schema_name=o.schema_name
 WHERE e.id=$1 AND e.status='active' AND o.status='active' AND s.status<>'archived'`;
const stored=(row:DeclarationValues):DeclarationValues=>({tokenDomain:row.tokenDomain,caseInsensitive:row.caseInsensitive,sourceTimezone:row.sourceTimezone,epochUnit:row.epochUnit,canonId:row.canonId});
const missing=()=>err(new DomainError('not_found','The catalogue element or schema was not found in this project.'));
async function projectName(ctx:TemporalContext){const [p]=await withPlatform(tx=>tx.query<{name:string}>('SELECT name FROM project WHERE id=$1',[ctx.projectId]));return p?.name??'';}
export class PostgresElementDeclarations implements DeclarationRepository {
 constructor(private readonly canonicalisers:DeclarationCanonicalisers){}
 async read(ctx:TemporalContext,element:ElementId){
  const [row]=await withTenant(ctx,tx=>tx.query<Row>(select,[element]));if(!row)return missing();
  // Resolve authorization/tenant ownership before Engine discovery; foreign IDs
  // must neither contact another project's Engine nor disclose its diagnostics.
  const available=await this.canonicalisers.canonicalisers(ctx,element);
  return ok({elementId:row.elementId,sourceId:row.sourceId,schemaName:row.schemaName,qualifiedName:row.qualifiedName,exposedType:row.exposedType,projectName:await projectName(ctx),stored:stored(row),schemaTimezone:row.schemaTimezone,effective:effectiveDeclarations(row.exposedType,row,row.schemaTimezone,{projectId:ctx.projectId,elementId:element}),tokenizedEntitlements:row.tokenizedEntitlements,canonicalisers:available.ok?[...available.value]:[],discoveryError:available.ok?null:available.error.message});
 }
 async save(ctx:TemporalContext,element:ElementId,input:unknown){
  const parsed=DeclarationCommand.safeParse(input);
  if(!parsed.success)return err(new DomainError('validation_failed',parsed.error.issues[0]?.message??'Invalid element declarations.',{fields:parsed.error.issues.map(issue=>String(issue.path[0]??'declarations'))}));
  const next=stored(parsed.data);
  if(next.sourceTimezone!==null&&!sourceTimezone.safeParse(next.sourceTimezone).success)return err(new DomainError('validation_failed','sourceTimezone must name a valid IANA timezone.',{fields:['sourceTimezone']}));
  const result=await withTenant(ctx,async tx=>{
   const locked=await tx.query('SELECT s.id FROM data_source s JOIN catalog_object o ON o.source_id=s.id JOIN catalog_element e ON e.object_id=o.id WHERE e.id=$1 FOR UPDATE OF s',[element]);if(!locked.length)return missing();
   const [row]=await tx.query<Row>(select+' FOR UPDATE OF e',[element]);if(!row)return missing();
   for(const validation of [validateTokenDeclarations(row.exposedType,next),validateTemporalType(row.exposedType,next),...(next.canonId===null?[]:[validateCanonicaliserType(next.canonId,row.exposedType,next.epochUnit)]),...(row.tokenizedEntitlements>0?[validateTokenizedTemporal(row.exposedType,{...next,sourceTimezone:next.sourceTimezone??row.schemaTimezone})]:[])])if(!validation.ok)return validation;
   if(next.canonId!==null&&next.canonId!==row.canonId){
    const available=await this.canonicalisers.canonicalisers(ctx,element);if(!available.ok)return available;
    if(!available.value.includes(next.canonId))return err(new DomainError('validation_failed','This canonicaliser is not advertised by the source’s Engine. Deploy it before assigning it.',{fields:['canonId']}));
   }
   if(row.tokenizedEntitlements>0&&tokenBehaviour(row.exposedType,row,row.schemaTimezone,{projectId:ctx.projectId,elementId:element})!==tokenBehaviour(row.exposedType,next,row.schemaTimezone,{projectId:ctx.projectId,elementId:element})&&parsed.data.confirmation!==await projectName(ctx))return err(new DomainError('conflict',(next.tokenDomain!==row.tokenDomain?domainMigrationConfirmation:'This changes effective tokenization for an already-tokenized element. Previously issued tokens will no longer match subsequent tokens.')+' Type the project name exactly to confirm.',{fields:['confirmation']}));
   if(JSON.stringify(stored(row))!==JSON.stringify(next))await tx.query('UPDATE catalog_element SET token_domain=$2,case_insensitive=$3,source_timezone=$4,epoch_unit=$5,canon_id=$6 WHERE id=$1',[element,next.tokenDomain,next.caseInsensitive,next.sourceTimezone,next.epochUnit,next.canonId]);
   return ok(undefined);
  });
  return result.ok?this.read(ctx,element):result;
 }
 async schema(ctx:TemporalContext,source:SourceId,schema:string){
  const [row]=await withTenant(ctx,tx=>tx.query<{qualifiedName:string;sourceTimezone:string|null;tokenizedInheritors:number}>(`SELECT concat_ws('.',s.exposed_alias,min(o.exposed_schema)) AS "qualifiedName",d.source_timezone AS "sourceTimezone",
   (SELECT count(*)::int FROM entitlement t JOIN catalog_element e ON e.id=t.element_id JOIN catalog_object x ON x.id=e.object_id WHERE x.source_id=s.id AND x.schema_name=$2 AND e.source_timezone IS NULL AND e.exposed_type='TIMESTAMP' AND t.treatment='tokenized') AS "tokenizedInheritors"
   FROM data_source s JOIN catalog_object o ON o.source_id=s.id AND o.schema_name=$2 AND o.status='active'
   LEFT JOIN catalog_schema_temporal d ON d.source_id=s.id AND d.schema_name=$2 WHERE s.id=$1 AND s.status<>'archived' GROUP BY s.id,d.source_timezone`,[source,schema]));
  return row?ok({sourceId:source,schemaName:schema,...row,projectName:await projectName(ctx)}):missing();
 }
}

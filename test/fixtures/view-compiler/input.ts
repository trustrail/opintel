// Black-box fixtures: use only public aggregate factories and the B.1 interface.
import { CatalogElement, CatalogObject, type ElementState, type ExposedType } from '../../../src/modules/catalog/index.js';
import { Entitlement, type CompileInput, type Treatment } from '../../../src/modules/entitlements/index.js';
import type { ElementId, ObjectId, PoolId, ProjectId, SourceId, UserId, ExposedName, Timestamp, Result } from '../../../src/shared/kernel/index.js';

export const unwrap = <T>(result: Result<T>): T => {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
  return result.value;
};
export type ColumnSpec = {
  name: string; source?: string; treatment: Treatment | null; ordinal?: number;
  type?: ExposedType; declarations?: Partial<Pick<ElementState,'tokenDomain'|'caseInsensitive'|'canonId'|'sourceTimezone'|'schemaTimezone'|'epochUnit'>>;
};
export type ObjectSpec = {name:string; schema?:string; alias?:string; columns:ColumnSpec[]};
export function fixture(specs: readonly ObjectSpec[]): CompileInput {
  let next=1;
  const id=()=>`00000000-0000-7000-8000-${String(next++).padStart(12,'0')}`;
  const projectId=id() as ProjectId, poolId=id() as PoolId, userId=id() as UserId;
  const at='2026-09-25T00:00:00.000Z' as Timestamp;
  const sources=new Map<string,CompileInput['boundSources'][number]>();
  const objects:CatalogObject[]=[], elements:CatalogElement[]=[], entitlements=new Map<ElementId,Entitlement>();
  for (const spec of specs) {
    const alias=spec.alias??'fixture_catalog';
    let source=sources.get(alias);
    if(!source){source={id:id() as SourceId,projectId,alias:alias as ExposedName,kind:'postgres'};sources.set(alias,source);}
    const objectId=id() as ObjectId;
    const columns=spec.columns.map((column,index)=>{
      const element=new CatalogElement({id:id() as ElementId,objectId,projectId,sourceIdentifier:column.source??`native_${index}`,
        stableRef:String(index+1),sourceType:column.type??'VARCHAR',exposedType:column.type??'VARCHAR',exposedName:column.name as ExposedName,
        ordinal:column.ordinal??index+1,nullable:true,isKey:false,description:null,status:'active',discoveredAt:at,removedAt:null,
        tokenDomain:'fixture1',caseInsensitive:column.type && column.type!=='VARCHAR' ? null : false,...column.declarations});
      if(column.treatment!==null)entitlements.set(element.state.id,unwrap(Entitlement.decide({poolId,elementId:element.state.id,projectId,
        treatment:column.treatment,maskKind:column.treatment==='masked'?'all':null,setBy:{kind:'user',id:userId},setAt:at,justification:null})));
      elements.push(element);return element;
    });
    objects.push(unwrap(CatalogObject.create({id:objectId,sourceId:source.id,projectId,schemaName:spec.schema??'fixture_schema',objectName:spec.name,
      exposedSchema:(spec.schema??'fixture_schema') as ExposedName,exposedName:spec.name as ExposedName,kind:'table',lineageKnown:true,
      rowEstimate:null,description:null,status:'active'},columns)));
  }
  return {poolId,boundSources:[...sources.values()],objects,elements,entitlements,aggregateMinGroupSize:7,policyVersion:1};
}

// Reproducible generated inputs; seed appears in every failing test's name.
export function generated(seed:number):CompileInput {
  let state=seed>>>0;
  const draw=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state;};
  const fragments=['select','FROM','quote"here','"; DROP VIEW x; --','Größe','東京','é','e\u0301','🚀','a.b','line\nbreak','slash\\tail','/* comment */',' space '];
  const choices:readonly (Treatment|null)[]=['clear','tokenized','masked','aggregate_only','withheld',null];
  const specs:Array<ObjectSpec>=[];
  for(let o=0;o<4;o++){
    const columns:Array<ColumnSpec>=[];
    for(let c=0;c<12;c++){
      const treatment=choices[(c+seed)%choices.length]!;
      columns.push({name:`s${seed}_o${o}_c${c}_${fragments[draw()%fragments.length]}_end`,treatment,ordinal:12-c});
    }
    specs.push({name:`object_${o}_${fragments[draw()%fragments.length]}`,schema:`schema_${o}`,alias:`catalog_${o%2}`,columns});
  }
  specs.push(
    {name:'fully_withheld',columns:[{name:'only_denied_withheld_marker',treatment:'withheld'}]},
    {name:'fully_undecided',columns:[{name:'only_denied_undecided_marker',treatment:null}]},
    {name:'mixed_omission',columns:[{name:'only_denied_mixed_w_marker',treatment:'withheld'},{name:'only_denied_mixed_u_marker',treatment:null}]},
  );
  return fixture(specs);
}

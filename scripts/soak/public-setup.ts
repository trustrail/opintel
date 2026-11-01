/** V-01 governance setup: the same public HTTP operations as the console. */
import {createHash} from 'node:crypto';
import {setTimeout as pause} from 'node:timers/promises';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {z} from 'zod';
import {SourceListItem,SourceListResponse} from '../../src/shared/api/source-schemas.js';
import {CatalogTreeResponse,type CatalogNode} from '../../src/shared/api/catalog.js';
import {PoolPage,PoolDetail} from '../../src/shared/api/pools.js';
import {PoolKeyCreationResponse,PoolKeyAffected} from '../../src/shared/api/pool-keys.js';
import {ElementDeclarations} from '../../src/shared/api/declarations.js';
import {RowDecisionRead} from '../../src/shared/api/row-entitlements.js';
import {PoolBudgetView} from '../../src/shared/api/pool-budgets.js';
import {EntitlementPage} from '../../src/shared/api/entitlement-read.js';
import {demoManifest,certificateForAgent,type DemoManifest} from './manifest.js';
import type {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {demoTables,declaredTokenDomain,declaredContributorKey,declaredTreatment,declaredFilter,generateSpecification} from '../demo-soak-definition.js';
export type PublicApi=(path:string,method?:string,body?:unknown)=>Promise<unknown>;
export async function setupV01(input:{projectId:string;engineId:string;credentialRef:string;manifestFile:string;associations:CertificateAssociation[];call:PublicApi;lifecycle?:boolean;renew?:boolean}){
 const {projectId:p,call}=input;
 const hash=createHash('sha256').update(JSON.stringify(demoTables)).digest('hex');
 let manifest:DemoManifest={version:1,projectId:p,definitionHash:hash,agents:[],objects:{}};
 try{manifest=demoManifest.parse(JSON.parse(await readFile(input.manifestFile,'utf8')));if(manifest.projectId!==p||manifest.definitionHash!==hash)throw new Error('V-01 manifest belongs to another fixture');}catch(e){if(!(e instanceof Error&&'code'in e&&e.code==='ENOENT'))throw e;}
 const persist=async()=>{await mkdir(dirname(input.manifestFile),{recursive:true,mode:0o700});await writeFile(input.manifestFile+'.next',JSON.stringify(manifest),{mode:0o600});const {rename}=await import('node:fs/promises');await rename(input.manifestFile+'.next',input.manifestFile);};
 async function items(path:string){const rows:unknown[]=[];let cursor:string|null=null;do{const page=z.object({items:z.array(z.unknown()),nextCursor:z.string().nullable()}).parse(await call(path+(path.includes('?')?'&':'?')+new URLSearchParams({limit:'100',...(cursor?{cursor}:{})})));rows.push(...page.items);cursor=page.nextCursor;}while(cursor);return rows;}
 async function catalogue(parent:string){const rows:CatalogNode[]=[];let cursor:string|null=null;do{const page=CatalogTreeResponse.parse(await call(`/api/v1/projects/${p}/catalog?`+new URLSearchParams({parent,limit:'100',...(cursor?{cursor}:{})})));rows.push(...page.nodes);cursor=page.nextCursor;}while(cursor);return rows;}
 if(input.associations.length!==4)throw new Error('Four authorized XQ certificate associations are required');
 const sources:z.infer<typeof SourceListItem>[]=[];
 for(const [schema,name] of [['soak_policies','Reinsurance Policies'],['soak_claims','Reinsurance Claims'],['soak_recoveries','Reinsurance Recoveries']] as const){
  let source=(await items(`/api/v1/projects/${p}/sources`)).map(v=>SourceListItem.parse(v)).find(s=>s.name===name);
  if(!source)source=SourceListItem.parse(await call(`/api/v1/projects/${p}/sources`,'POST',{engineId:input.engineId,name,kind:'postgres',credentialRef:input.credentialRef,includeSchemas:[schema],samplingConsent:false,receivesLandings:false,landingStrategy:null}));
  const id=source.id,until=Date.now()+120000;
  for(;;){const current=SourceListResponse.parse(await call(`/api/v1/projects/${p}/sources?limit=100`)).items.find(s=>s.id===id);if(current?.status==='connected'){source=current;break;}if(!current||['archived','unreachable','introspection_failed'].includes(current.status)||Date.now()>until)throw new Error('V-01 source is not ready');await pause(500);}
  sources.push(source);
 }
 const tables:Array<{node:CatalogNode;source:z.infer<typeof SourceListItem>;columns:CatalogNode[]}>=[];
 for(const source of sources)for(const node of await catalogue('objects:'+source.id))tables.push({node,source,columns:await catalogue(node.id)});
 if(tables.length!==demoTables.length||new Set(tables.map(t=>t.node.label)).size!==demoTables.length)throw new Error('Catalogue differs from V-01');
 for(const t of tables){if(!demoTables.some(d=>d.name===t.node.label&&d.schema===t.node.schemaName))throw new Error('Unexpected V-01 object');manifest.objects[t.node.qualifiedName??`${t.source.exposedAlias}.${t.node.schemaName}.${t.node.label}`]=t.node.label!;}
 for(const poolIndex of [0,1]){
  const name=`Cedant 0${poolIndex+1}`,existing=PoolPage.parse({items:await items(`/api/v1/projects/${p}/pools`),nextCursor:null}).items.find(v=>v.name===name);
  let pool=existing?.id;
  const association=(index:number)=>{const slot=certificateForAgent(poolIndex,index,input.associations);return input.associations.find(a=>a.certificateId===slot.certificateId)!;};
  if(!pool){const created=PoolKeyCreationResponse.parse(await call(`/api/v1/projects/${p}/pools`,'POST',{name,budgets:{threads:1},certificateAssociation:association(0),tableSetup:{tables:tables.map(t=>t.node.id),rowRule:{column:'cedant',operator:'=',value:name.toLowerCase().replace(' ','_')},startingMode:{kind:'nothing_yet'}}}));if(!created.keyShown||!created.credentialId)throw new Error('V-01 pool issuance was not recoverable');pool=created.poolId;manifest.agents.push({poolIndex,pool,credentialId:created.credentialId,key:created.key,association:association(0)});await persist();}
  if(!manifest.agents.some(a=>a.pool===pool))throw new Error('Existing pool has no saved verifier credentials; nothing was overwritten');
  const bound=z.object({items:z.array(z.object({objectId:z.uuid()})),nextCursor:z.string().nullable()}).parse(await call(`/api/v1/pools/${pool}/tables?projectId=${p}&limit=100`));
  if(bound.nextCursor||bound.items.some(t=>!tables.some(v=>v.node.id===t.objectId)))throw new Error('V-01 table binding conflict');
  if(bound.items.length!==tables.length)await call(`/api/v1/pools/${pool}/tables`,'POST',{projectId:p,tables:tables.map(t=>t.node.id),rowRule:{column:'cedant',operator:'=',value:name.toLowerCase().replace(' ','_')}});
  const budget=PoolBudgetView.parse(await call(`/api/v1/pools/${pool}/budgets?projectId=${p}`));if(Object.keys(budget.budgets).some(k=>k!=='threads')||budget.budgets.threads!==1)throw new Error('V-01 pool budget conflict');
  const detail=PoolDetail.parse(await call(`/api/v1/pools/${pool}?projectId=${p}`));const known=[...manifest.agents,...Object.values(manifest.lifecycle??{})];if(detail.credentials?.some(c=>!known.some(a=>a.credentialId===c.id)))throw new Error('V-01 credential inventory conflict');
  while(manifest.agents.filter(a=>a.pool===pool).length<5){const i=manifest.agents.filter(a=>a.pool===pool).length,issued=PoolKeyCreationResponse.parse(await call(`/api/v1/pools/${pool}/credentials`,'POST',{projectId:p,label:`V-01 agent ${i+1}`,certificateAssociation:association(i)}));if(!issued.keyShown||!issued.credentialId)throw new Error('V-01 credential issuance was not recoverable');manifest.agents.push({poolIndex,pool,credentialId:issued.credentialId,key:issued.key,association:association(i)});await persist();}
  for(const t of tables){
   const expected=demoTables.find(d=>d.name===t.node.label)!;
   if(t.columns.length!==Object.keys(expected.rows[0]!).length)throw new Error('V-01 column inventory conflict');
   const expression=declaredFilter(expected.name,poolIndex);
   if(expected.name==='open_reference'){
    const current=RowDecisionRead.parse(await call(`/api/v1/pools/${pool}/row-entitlements/${t.node.id}?projectId=${p}`));
    if(!current.current)await call(`/api/v1/pools/${pool}/tables/${t.node.id}/rows`,'PUT',{projectId:p,rowRule:{allRows:true}});
   }else if(expected.name==='treaty_reference'&&poolIndex===0){
    const current=RowDecisionRead.parse(await call(`/api/v1/pools/${pool}/row-entitlements/${t.node.id}?projectId=${p}`));
    if(!current.current)await call(`/api/v1/pools/${pool}/row-entitlements/${t.node.id}`,'PUT',{projectId:p,expression});
   }
   const current=RowDecisionRead.parse(await call(`/api/v1/pools/${pool}/row-entitlements/${t.node.id}?projectId=${p}`));
   const expectedExpression=expected.name==='open_reference'?`(("${Object.keys(expected.rows[0]!)[0]}" IS NULL OR "${Object.keys(expected.rows[0]!)[0]}" IS NOT NULL))`:expression?'('+(expected.name==='treaty_reference'?expression:expression.replace('cedant','"cedant"'))+')':null;
   if(current.effectiveExpression!==expectedExpression)throw new Error('V-01 row decision conflict: '+expected.name);
   for(const column of t.columns){
    const treatment=declaredTreatment(expected.name,column.label!,poolIndex),path=`/api/v1/projects/${p}/catalog/elements/${column.id}/declarations`;
    if(column.exposedType!==(column.label==='claim_amount'?'INTEGER':column.label==='loss_date'?'DATE':'VARCHAR'))throw new Error('V-01 column type conflict');
    if(treatment==='tokenized'||column.label===declaredContributorKey(expected.name)){
     const d=ElementDeclarations.parse(await call(path));const values={...d.stored,...(treatment==='tokenized'?{tokenDomain:declaredTokenDomain(column.label!),caseInsensitive:false}:{}),...(column.label===declaredContributorKey(expected.name)?{contributorKey:true}:{})};
     if(d.stored.tokenDomain!==null&&d.stored.tokenDomain!==values.tokenDomain)throw new Error('V-01 token declaration conflict');
     if(JSON.stringify(d.stored)!==JSON.stringify(values))await call(path,'PUT',values);
    }
   }
   const entitlements=EntitlementPage.parse(await call(`/api/v1/pools/${pool}/entitlements?`+new URLSearchParams({projectId:p,parent:t.node.id,limit:'100'})));
   for(const column of t.columns){const treatment=declaredTreatment(expected.name,column.label!,poolIndex),present=entitlements.nodes.find(c=>c.id===column.id);
    if(present?.treatment&&present.treatment!==treatment)throw new Error('V-01 treatment conflict');
    if(treatment==='undecided'){if(present?.treatment)throw new Error('V-01 undecided column has a treatment');continue;}
    if(!present?.treatment)await call(`/api/v1/pools/${pool}/entitlements/bulk`,'POST',{projectId:p,elementIds:[column.id],treatment,maskKind:treatment==='masked'?'last4':null,justification:'Versioned V-01 verification decision'});
   }
  }
 }
 if(input.lifecycle){manifest.lifecycle??={};if(input.renew){for(const kind of ['retiring','revoked']){const old=manifest.lifecycle[kind];if(old){manifest.lifecycle[kind+'-previous-'+old.credentialId]=old;delete manifest.lifecycle[kind];}}await persist();}
  for(const kind of ['retiring','revoked'] as const){const a=manifest.agents.find(a=>a.poolIndex===0)!;let probe=manifest.lifecycle[kind];
   if(!probe){const issued=PoolKeyCreationResponse.parse(await call(`/api/v1/pools/${a.pool}/credentials`,'POST',{projectId:p,label:'Soak '+kind,...kind==='retiring'?{certificateAssociation:a.association}:{}}));if(!issued.keyShown||!issued.credentialId)throw new Error('Lifecycle credential issuance was not recoverable');probe={...a,key:issued.key,credentialId:issued.credentialId,keyVersion:issued.keyVersion};manifest.lifecycle[kind]=probe;await persist();}
   if(!probe.done){if(kind==='retiring'){const rotated=PoolKeyCreationResponse.parse(await call(`/api/v1/pools/${probe.pool}/keys/rotate`,'POST',{projectId:p,credentialId:probe.credentialId}));if(!rotated.keyShown)throw new Error('Lifecycle rotation was not recoverable');probe.replacementKey=rotated.key;probe.graceUntil=PoolKeyAffected.parse(await call(`/api/v1/pools/${probe.pool}/keys/${probe.keyVersion}/affected-agents?projectId=${p}`)).graceUntil;}else await call(`/api/v1/pools/${probe.pool}/credentials/revoke`,'POST',{projectId:p,credentialId:probe.credentialId,confirmation:'Soak revoked'});probe.done=true;await persist();}
  }
 }
 manifest.version=2;manifest.specification=generateSpecification(Object.fromEntries(Object.entries(manifest.objects).map(([full,name])=>[name,full])),manifest.agents);await persist();return manifest;
}

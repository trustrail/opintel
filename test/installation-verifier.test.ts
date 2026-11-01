import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {cells,selectCells,logicalId} from '../scripts/verification/verifier/registry.js';
import {schedule,MissingPrerequisite} from '../scripts/verification/verifier/scheduler.js';
import {report} from '../scripts/verification/verifier/report.js';
import {demoTables,generateSpecification} from '../scripts/demo-soak-definition.js';
import type {DemoManifest} from '../scripts/soak/manifest.js';
it('ports every V-01 expectation unchanged and gives each installation the same 115 logical cell IDs',()=>{
 const names=Object.fromEntries(demoTables.map(t=>[t.name,`customer.${t.schema}.${t.name}`]));
 const agents=Array.from({length:10},(_,i)=>({poolIndex:Math.floor(i/5),credentialId:randomUUID(),association:{}}));
 const generated=generateSpecification(names,agents),manifest={objects:Object.fromEntries(Object.entries(names).map(([name,full])=>[full,name])),agents} as DemoManifest;
 expect(generated.scenarios).toHaveLength(115);expect(cells).toHaveLength(115);
 for(const scenario of generated.scenarios){const registered=cells.find(c=>c.id===logicalId(scenario,manifest));expect(registered).toBeDefined();expect(registered!.expected).toEqual(scenario.expected);}
 const adapted=cells.filter(c=>c.expectedEvidence.rowScopes.some(s=>s.mode==='explicit_all_rows'));expect(adapted).toHaveLength(4);
 expect(adapted.every(c=>c.expectedEvidence.rowScopes.every(s=>s.mode==='explicit_all_rows'))).toBe(true);
});
it('selectors claim only selected cells; dependency expansion never claims extra custody coverage',()=>{
 const custody=selectCells({capability:['custody']});expect(custody.length).toBeGreaterThan(0);expect(custody.every(c=>c.capability==='custody')).toBe(true);
 const one=selectCells({cell:[cells[0]!.id]});expect(one).toEqual([cells[0]]);expect(one[0]!.prerequisites).toContain('governance');
 expect(selectCells({all:true,where:['credential=revoked']})).toHaveLength(1);
 expect(()=>selectCells({where:['notADimension=secret']})).toThrow();expect(()=>selectCells({cell:['not-a-cell']})).toThrow();
});
it('runs every selected cell exactly once and refuses an otherwise plausible pass when one check fails',async()=>{
 const seen:string[]=[];const result=await schedule(cells,async c=>{seen.push(c.id);return {...c.expected,checks:{receipt:true}};});
 expect(seen).toEqual(cells.map(c=>c.id));expect(result.status).toBe('passed');
 expect((await schedule([cells[0]!],async c=>({...c.expected,checks:{receipt:false}}))).status).toBe('failed');
});
it('missing prerequisites, expired lifecycle and interruption are not exercised and fail, while remaining cells stay visible',async()=>{
 const selected=[cells[0]!,cells[1]!],stop=new AbortController();let called=0;
 const interrupted=await schedule(selected,async c=>{called++;stop.abort();return c.expected;},{signal:stop.signal});
 expect(called).toBe(1);expect(interrupted.status).toBe('failed');expect(interrupted.results.map(r=>r.status)).toEqual(['passed','not exercised']);
 const missing=await schedule(selected,async()=>{throw new Error('must not run');},{unavailable:new Map([['fixture','private secret']])});expect(missing.results.every(r=>r.status==='not exercised')).toBe(true);expect(JSON.stringify(missing)).not.toContain('private secret');
 const expired=await schedule([cells.find(c=>c.dimensions.credential==='retiring')!],async()=>{throw new MissingPrerequisite('retiring credential window expired');});expect(expired.results[0]!.status).toBe('not exercised');expect(expired.status).toBe('failed');
});
it('checkpoints are failed until complete and reports never include exception text or unselected coverage',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'verifier-report-'));try{
 const selected=[cells[0]!];const failed=await schedule(selected,async()=>{throw new Error('postgresql://operator:SECRET@host/db');});
 await report(directory,selected,failed.results,{revision:'fixture'},true);
 const text=await readFile(join(directory,'result.json'),'utf8'),value=JSON.parse(text) as {status:string;counts:{selected:number;failed:number}};
 expect(text).not.toContain('SECRET');expect(value.status).toBe('failed');expect(value.counts).toMatchObject({selected:1,failed:1});
 const partial=await report(directory,selected,[],{revision:'fixture'},false);expect(partial.counts.notExercised).toBe(1);expect(partial.status).toBe('failed');
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('resumes through the cursor-paginated console project list without assuming a project-detail endpoint',async()=>{
 const {publicProject}=await import('../scripts/operator/public-project.js');const id=randomUUID(),company=randomUUID(),industry=randomUUID(),paths:string[]=[];
 const project={id,name:'Verifier',region:'us-east-1',company:{id:company,name:'Company'},industry:{id:industry,name:'Reinsurance'},role:'admin'};
 const found=await publicProject(async path=>{paths.push(path);return path.includes('cursor=')?{items:[project],nextCursor:null}:{items:[],nextCursor:'opaque-cursor'};},id);
 expect(found.id).toBe(id);expect(paths).toEqual(['/api/v1/projects?limit=100','/api/v1/projects?limit=100&cursor=opaque-cursor']);
 await expect(publicProject(async()=>({items:[],nextCursor:null}),id)).rejects.toThrow('missing or inaccessible');
});
it('uses the existing engine edit API for an auto-attached paired engine and refuses a different pin',async()=>{
 const {verificationEngine}=await import('../scripts/verification/verifier/infrastructure/engine.js');const project=randomUUID(),id=randomUUID(),pin='A'.repeat(64),calls:Array<{path:string;method:string;body:unknown}>=[];
 let address='https://192.0.2.1:3100';const row=()=>({id,name:'Paired engine',address,certificatePin:pin,contractVersion:1,verifiedAt:null,lastSeenAt:null,health:'unverified',healthMessage:null,custody:false,sources:[]});
 const result=await verificationEngine(async(path,method='GET',body)=>{calls.push({path,method,body});if(method==='PATCH'){address='https://host.docker.internal:3100';return {ok:true};}return {items:[row()],nextCursor:null};},project,{address,pin},'https://host.docker.internal:3100');
 expect(result).toBe(id);expect(calls.filter(c=>c.method==='PATCH')).toEqual([{path:`/api/v1/projects/${project}/engines/${id}`,method:'PATCH',body:{name:'Paired engine',address:'https://host.docker.internal:3100',certificatePin:pin}}]);expect(calls.some(c=>c.method==='POST')).toBe(false);
 await expect(verificationEngine(async()=>({items:[row()],nextCursor:null}),project,{address,pin:'B'.repeat(64)})).rejects.toThrow('pin differs');
});
it('reports fixture setup failure with its precise step and native cause in JSON and Markdown, without secrets',async()=>{
 const {setupStep,diagnostic}=await import('../scripts/verification/verifier/diagnostics.js');
 const directory=await mkdtemp(join(tmpdir(),'verifier-fixture-failure-'));try{
 let detail:ReturnType<typeof diagnostic>|undefined;
 try{await setupStep('fixture',()=>setupStep('fixture.seed',async()=>{throw new Error('Failed to connect postgresql://operator:SECRET@private/db',{cause:Object.assign(new Error('connect ECONNREFUSED'),{code:'ECONNREFUSED'})});}));}catch(error){detail=diagnostic(error,'fixture');}
 expect(detail).toMatchObject({step:'fixture.seed',route:null,httpStatus:null,refusalCode:null,cause:null,errorClass:'Error',causes:[{errorCode:'ECONNREFUSED',message:'connect ECONNREFUSED'}]});
 const failed=await schedule([cells[0]!],async()=>{throw new Error('must not run');},{unavailable:new Map([['fixture','unavailable']])});
 const value=await report(directory,[cells[0]!],failed.results,null,true,{errors:[detail]});expect(value.status).toBe('failed');expect(value.counts.notExercised).toBe(1);
 for(const file of ['result.json','matrix.md']){const text=await readFile(join(directory,file),'utf8');expect(text).toContain('fixture.seed');expect(text).toContain('ECONNREFUSED');expect(text).not.toContain('SECRET');expect(text).not.toContain('private/db');}
 }finally{await rm(directory,{recursive:true,force:true});}
});
it('retains failed public request context and redacts secrets and returned values in cell diagnostics',async()=>{
 const {setupStep,requestContext,sanitizedMessage}=await import('../scripts/verification/verifier/diagnostics.js');
 const result=await schedule([cells[0]!],()=>setupStep('public-api',async()=>{requestContext('/api/v1/runs/receipt?token=SECRET',503,{error:{code:'source_unavailable',details:{cause:'engine_registry'}}});throw Object.assign(new Error('connect ETIMEDOUT'),{code:'ETIMEDOUT'});}));
 expect(result.status).toBe('failed');expect(result.results[0]!.errors?.[0]).toMatchObject({step:'cell',cellId:cells[0]!.id,route:'/api/v1/runs/receipt',httpStatus:503,refusalCode:'source_unavailable',cause:'engine_registry',errorCode:'ETIMEDOUT'});
 expect(sanitizedMessage('password=SECRET cookie=SECRET postgresql://user:SECRET@host/db row: CUSTOMER-VALUE')).not.toMatch(/SECRET|CUSTOMER-VALUE/u);
});

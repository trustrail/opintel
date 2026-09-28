import { z } from 'zod';

const errorSchema=z.strictObject({name:z.string(),message:z.string()});
const caseSchema=z.strictObject({file:z.string(),name:z.string(),state:z.enum(['passed','failed','skipped','pending']),errors:z.array(errorSchema)});
const findingSchema=z.strictObject({id:z.string(),variant:z.string(),status:z.string(),detail:z.string()});
export const findingsSchema=z.array(findingSchema);
export const runSchema=z.strictObject({reason:z.enum(['passed','failed','interrupted']),errors:z.array(errorSchema),tests:z.array(caseSchema)});
export const registrySchema=z.strictObject({
 requiredTests:z.array(z.strictObject({file:z.string(),name:z.string()})),
 open:z.array(z.strictObject({file:z.string(),name:z.string(),owner:z.string().min(1),reason:z.string().min(1),errors:z.array(errorSchema).min(1),
  findings:z.array(findingSchema).min(1)})),
});
export type BypassRun=z.infer<typeof runSchema>;
export type Registry=z.infer<typeof registrySchema>;
export type Finding=z.infer<typeof findingSchema>;
const key=(value:{file:string;name:string})=>`${value.file} :: ${value.name}`;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
// OOM allocation sizes vary with the allocator. The unchanged child test proves
// real OOM and zero spill. Only this one finding normalizes to its engine family.
export function normalizeFinding(finding:Finding):Finding{
 return finding.id==='J-020'&&finding.variant==='memory pressure'&&finding.status==='REFUSED_RAW'&&finding.detail.startsWith('Out of Memory Error:')
  ?{...finding,detail:'Out of Memory Error'}:finding;
}

/** No wildcard xfail: exact test, exact assertion errors, exact observations.
 * This gate does not catch exceptions from tests or replace their assertions. */
export function evaluateBypass(run:BypassRun,findings:Finding[],registry:Registry){
 findings=findings.map(normalizeFinding);
 const regressions:string[]=[],queue:string[]=[];
 const actual=new Map<string,BypassRun['tests'][number]>();
 const expected=new Map<string,Registry['open'][number]>();
 const required=new Set(registry.requiredTests.map(key));
 if(required.size!==registry.requiredTests.length)regressions.push('Duplicate required-test registration.');
 for(const entry of registry.open){
  if(expected.has(key(entry)))regressions.push(`Duplicate open entry: ${key(entry)}`);
  if(!required.has(key(entry)))regressions.push(`Open entry is not in required inventory: ${key(entry)}`);
  expected.set(key(entry),entry);
 }
 if(run.reason==='interrupted')regressions.push('Bypass run was interrupted.');
 if(run.reason==='failed'&&!run.tests.some(t=>t.state==='failed'))regressions.push('Runner failed without a matching failed test.');
 if(run.reason==='passed'&&run.tests.some(t=>t.state==='failed'))regressions.push('Runner result contradicts its failed tests.');
 for(const error of run.errors)regressions.push(`Suite/runner error: ${error.name}: ${error.message}`);
 for(const test of run.tests){
  const id=key(test);
  if(actual.has(id))regressions.push(`Duplicate test: ${id}`);
  actual.set(id,test);
  const open=expected.get(id);
  if(test.state==='skipped'||test.state==='pending'){regressions.push(`Did not execute: ${id}`);continue;}
  if(open){
   if(test.state==='passed'){regressions.push(`Open entry now passes: ${id}. Remove it with its ${open.owner} fix; do not silently retain an exemption.`);continue;}
   if(!same(test.errors,open.errors)){regressions.push(`Changed failure: ${id}`);continue;}
   if(!open.findings.every(f=>findings.filter(actualFinding=>same(actualFinding,f)).length===1)){
    regressions.push(`Changed or missing attack evidence: ${id}`);continue;
   }
   queue.push(`OPEN [${open.owner}] ${test.name} — ${open.reason}`);
  }else if(test.state!=='passed'||test.errors.length){regressions.push(`New failure: ${id}`);}
 }
 for(const id of required)if(!actual.has(id))regressions.push(`Missing required attack/control: ${id}`);
 // A newly succeeding attack must fail even if a test stops asserting refusal.
 // Also catch a new raw error inside J-048, even if its assertion text is unchanged.
 for(const finding of findings.filter(f=>['ATTACK_SUCCEEDED','BLOCKED','REFUSED_RAW','INVALID_PROBE','MISSING_ENVELOPE'].includes(f.status))){
  if(!registry.open.some(entry=>entry.findings.some(expectedFinding=>same(expectedFinding,finding)))){
   regressions.push(`New unsafe outcome: ${finding.id} ${finding.variant} (${finding.status})`);
  }
 }
 return {ok:regressions.length===0,queue,regressions,passed:run.tests.filter(t=>t.state==='passed').length};
}

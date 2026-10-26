/** Observer only: this module owns the cookie. Never pass it to an agent or log it.
 * Its only network operations are GETs of the existing receipt list/detail APIs. */
import {readFile,realpath,stat} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {z} from 'zod';
import {ActivityPage,EvidenceDetail} from '../../src/shared/api/activity.js';
export function outsideRepository(path:string,root=process.cwd()):boolean{const rel=relative(resolve(root),resolve(path));return rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel);}
export class ObserverFailure extends Error {readonly name='ObserverFailure';}
export function createObserver(base:URL,project:string,file:string|undefined,warn:(message:string)=>void,onFailure:()=>void=()=>{}){
 z.uuid().parse(project);
 let failure:ObserverFailure|undefined,ready=false,required=0,completed=0;
 let heartbeat:ReturnType<typeof setInterval>|undefined,pending:Promise<void>|undefined;
 const stopped=new AbortController();
 const fail=(why:string):never=>{
  if(!failure){failure=new ObserverFailure(why);clearInterval(heartbeat);warn('!!! SOAK FAILED: receipt verification unavailable: '+why+'; no retry or database fallback.');stopped.abort();onFailure();}
  throw failure;
 };
 const assertAvailable=()=>{if(failure)throw failure;};
 const cookie=async()=>{
  assertAvailable();if(!file)return fail('Missing --observer-cookie. Supply a fresh signed-in console session in an outside-repository mode-600 file.');
  try{
   // Re-read for every request so an operator can replace a session before its
   // absolute expiry. Never mint, extend past policy, or resurrect a session.
   const actual=await realpath(file);if(!outsideRepository(actual)||(await stat(actual)).mode&0o077)throw new Error();
   const input=(await readFile(actual,'utf8')).trim();if(!/^(?:opintel_session=[^;\s\r\n]+|opintel_observer=[A-Za-z0-9_-]{43})$/u.test(input))throw new Error();return input;
  }catch{return fail('Cookie file missing, inside repository, unreadable, insecure or invalid. Sign in again and replace the outside-repository mode-600 file.');}
 };
 const get=async(path:string):Promise<unknown>=>{
  const value=await cookie();assertAvailable();
  let response:Response;
  try{response=await fetch(new URL(path,base),{method:'GET',headers:{cookie:value,accept:'application/json','x-opintel-diag-client':'soak-observer'},redirect:'error',signal:AbortSignal.any([stopped.signal,AbortSignal.timeout(15000)])});}
  catch{return fail('Observer request failed (network, redirect or timeout).');}
  assertAvailable();
  if(!response.ok){await response.body?.cancel().catch(()=>{});return fail(`Receipt API HTTP ${response.status}. ${response.status===401?'Session expired, revoked or lost; sign in again and replace the cookie file before restarting the run.':'Receipt verification cannot continue.'}`);}
  try{return await response.json() as unknown;}catch{return fail('Receipt API returned invalid JSON.');}
 };
 const listPath=`/api/v1/projects/${project}/runs`;
 const probe=async()=>{if(!ActivityPage.safeParse(await get(listPath+'?limit=1')).success)fail('Observer receipt-list contract rejected.');};
 return {
  async ready(){
   await probe();ready=true;
   // Receipt GETs already touch the server's idle session. Keep that true even
   // during slow queries/pauses; this does not bypass the 30-day absolute limit.
   heartbeat=setInterval(()=>{if(!pending)pending=probe().catch(()=>{}).finally(()=>{pending=undefined;});},30000);heartbeat.unref();
  },
  async close(){clearInterval(heartbeat);await pending;},
  // Three checks per query: completed receipt exists, correct caller, no literals.
  async read(id:string,agentId:string):Promise<ReturnType<typeof EvidenceDetail.parse>|null>{
   required+=3;assertAvailable();if(!ready)return fail('Observer preflight was not completed.');
   if(!z.uuid().safeParse(id).success){completed++;return null;}
   let cursor:string|null=null;
   do{
    const query=new URLSearchParams({limit:'100',agentId,...cursor?{cursor}:{}});
    const parsed=ActivityPage.safeParse(await get(listPath+'?'+query));if(!parsed.success)return fail('Observer receipt-list contract rejected.');
    const row=parsed.data.items.find(r=>r.id===id);
    if(row){const detail=await get(`/api/v1/runs/${id}?`+new URLSearchParams({projectId:project,startedAt:row.startedAt}));
     const checked=EvidenceDetail.safeParse(detail);if(!checked.success)return fail('Observer receipt-detail contract rejected.');completed+=3;return checked.data;}
    cursor=parsed.data.nextCursor;
   }while(cursor);
   completed++;return null;
  },
  summary:()=>({enabled:ready&&!failure,failed:!ready||Boolean(failure),reason:failure?.message??null,checksSkipped:required-completed}),
 };
}

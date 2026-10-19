/** Observer only: this module owns the cookie. Never pass it to an agent or log it.
 * Its only network operations are GETs of the existing receipt list/detail APIs. */
import {readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {z} from 'zod';
import {ActivityPage,EvidenceDetail} from '../../src/shared/api/activity.js';
export function outsideRepository(path:string,root=process.cwd()):boolean{const rel=relative(resolve(root),resolve(path));return rel==='..'||rel.startsWith('..'+(process.platform==='win32'?'\\':'/'))||isAbsolute(rel);}
export async function createObserver(base:URL,project:string,file:string|undefined,warn:(message:string)=>void){
 z.uuid().parse(project);
 let cookie:string|undefined,reason:string|undefined,skipped=0;
 const disable=(why:string)=>{cookie=undefined;reason=why;warn('!!! RECEIPT INVARIANTS DISABLED: '+why+'; no database fallback.');};
 const get=async(path:string)=>{
  if(!cookie)return undefined;
  try{const response=await fetch(new URL(path,base),{method:'GET',headers:{cookie,accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15000)});
   if(!response.ok){disable(`Observer rejected or unavailable (HTTP ${response.status})`);return undefined;}
   return await response.json() as unknown;
  }catch{disable('Observer request failed');return undefined;}
 };
 try{if(!file)disable('No --observer-cookie supplied');else{
  const actual=await realpath(file);if(!outsideRepository(actual))throw new Error();
  const input=(await readFile(actual,'utf8')).trim();
  if(!/^opintel_session=[^;\s\r\n]+$/u.test(input))throw new Error();cookie=input;
 }}catch{disable('Cookie file missing, inside repository, unreadable or invalid (expected opintel_session=<value>)');}
 const listPath=`/api/v1/projects/${project}/runs`;
 if(cookie){const response=await get(listPath+'?limit=1');if(response!==undefined&&!ActivityPage.safeParse(response).success)disable('Observer receipt-list contract rejected');}
 return {
  // Three checks per query: completed receipt exists, correct caller, no literals.
  async read(id:string,agentId:string):Promise<ReturnType<typeof EvidenceDetail.parse>|undefined|null>{
   if(!cookie){skipped+=3;return undefined;}
   if(!z.uuid().safeParse(id).success)return null;
   let cursor:string|null=null;
   do{
    const query=new URLSearchParams({limit:'100',agentId,...cursor?{cursor}:{}});
    const raw=await get(listPath+'?'+query);if(raw===undefined){skipped+=3;return undefined;}
    const parsed=ActivityPage.safeParse(raw);if(!parsed.success){disable('Observer receipt-list contract rejected');skipped+=3;return undefined;}
    const row=parsed.data.items.find(r=>r.id===id);
    if(row){const detail=await get(`/api/v1/runs/${id}?`+new URLSearchParams({projectId:project,startedAt:row.startedAt}));if(detail===undefined){skipped+=3;return undefined;}
     const checked=EvidenceDetail.safeParse(detail);if(!checked.success){disable('Observer receipt-detail contract rejected');skipped+=3;return undefined;}return checked.data;}
    cursor=parsed.data.nextCursor;
   }while(cursor);
   return null;
  },
  summary:()=>({enabled:Boolean(cookie),reason:reason??null,checksSkipped:skipped}),
 };
}

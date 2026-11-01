import {diagnostic,diagnosticText,setupStep,type Diagnostic} from './diagnostics.js';
import {performance} from 'node:perf_hooks';
import type {Cell} from './registry.js';
export type Actual={outcome:string;cause?:string;reason?:string;rowCount?:number;receiptId?:string;checks?:Record<string,boolean>};
export type CellResult={id:string;capability:string;dimensions:Record<string,string>;status:'passed'|'failed'|'not exercised';expected:Cell['expected'];expectedEvidence:Cell['expectedEvidence'];actual:Actual|null;durationMs:number;diagnostics:string[];errors?:Diagnostic[]};
export class MissingPrerequisite extends Error {}
export async function schedule(selected:Cell[],run:(cell:Cell)=>Promise<Actual>,options:{signal?:AbortSignal;unavailable?:Map<string,string>;checkpoint?:(results:CellResult[])=>Promise<void>}={}){
 const results:CellResult[]=[];
 for(const cell of selected){const result:CellResult={id:cell.id,capability:cell.capability,dimensions:cell.dimensions,status:'not exercised',expected:cell.expected,expectedEvidence:cell.expectedEvidence,actual:null,durationMs:0,diagnostics:[]};const start=performance.now();
  try{if(options.signal?.aborted)throw new MissingPrerequisite('interrupted');for(const prerequisite of cell.prerequisites)if(options.unavailable?.has(prerequisite))throw new MissingPrerequisite('missing prerequisite: '+prerequisite);
   result.actual=await setupStep('cell',()=>run(cell),cell.id);const e=cell.expected,a=result.actual;
   result.status=a.outcome===e.outcome&&(e.rowCount===undefined||a.rowCount===e.rowCount)&&(e.cause===undefined||a.cause===e.cause)&&(e.reason===undefined||a.reason===e.reason)&&Object.values(a.checks??{}).every(Boolean)?'passed':'failed';
   if(result.status==='failed'){if(a.outcome!==e.outcome)result.diagnostics.push('outcome mismatch');if(e.rowCount!==undefined&&a.rowCount!==e.rowCount)result.diagnostics.push('row count mismatch');if(e.cause!==undefined&&a.cause!==e.cause)result.diagnostics.push('refusal cause mismatch');if(e.reason!==undefined&&a.reason!==e.reason)result.diagnostics.push('refusal reason mismatch');for(const [key,passed]of Object.entries(a.checks??{}))if(!passed)result.diagnostics.push('failed check: '+key);}
  }catch(error){result.status=isMissingPrerequisite(error)?'not exercised':'failed';const detail=diagnostic(error,'cell',{cellId:cell.id});result.errors=[detail];result.diagnostics.push(diagnosticText(detail));}
  finally{result.durationMs=Math.round(performance.now()-start);results.push(result);await options.checkpoint?.(results);}
 }
 return {status:results.length===selected.length&&results.every(r=>r.status==='passed')?'passed' as const:'failed' as const,results};
}

function isMissingPrerequisite(error:unknown):boolean{return error instanceof MissingPrerequisite||error instanceof Error&&error.cause!==undefined&&isMissingPrerequisite(error.cause);}

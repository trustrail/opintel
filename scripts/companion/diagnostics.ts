import {z} from 'zod';
import {transportFailure} from '../steps/infrastructure/diagnostics.js';
import type {RedemptionStep} from '../steps/service.js';
export class CompanionFailure extends Error {
 constructor(readonly step:RedemptionStep,readonly failure:unknown){super('Companion operation failed.');}
}
/** Deliberately never logs opaque exception text, input data, stacks or causes. */
export function internalDiagnostic(error:unknown){
 const step=error instanceof CompanionFailure?error.step:'lookup',failure=error instanceof CompanionFailure?error.failure:error;
 const names=new Set(['Error','TypeError','SyntaxError','ZodError','AbortError','TimeoutError','RangeError','McpError','StreamableHTTPError']);
 const name=failure instanceof Error&&names.has(failure.name)?failure.name:'Error';
 const fixed=['Invalid release share length.','Release grant does not match its result receipt and columns.','K2 response does not match the receipt and grant.','The result has no custody grants.','Custody column is absent from the result.','Custody cell is not sealed.','Invalid sealed value.','Unsupported state or unable to authenticate data'];
 const message=failure instanceof z.ZodError?'Response schema validation failed: '+failure.issues.map(issue=>issue.code+' at '+issue.path.map(part=>typeof part==='number'?'[index]':/^[A-Za-z_]{1,40}$/u.test(String(part))?String(part):'[field]').join('.')).join('; '):failure instanceof Error&&fixed.some(text=>failure.message.startsWith(text))?fixed.find(text=>failure.message.startsWith(text))!:transportFailure(failure);
 return {step,name,message};
}

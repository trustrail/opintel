import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
/** Local operator diagnostics only; never put exception text in API telemetry. */
export function operatorDiagnostic(error:unknown,directory=process.env.OPINTEL_OUTPUT_DIRECTORY??'/output',display=process.env.OPINTEL_DIAGNOSTIC_DISPLAY_DIRECTORY??directory){
 let message=error instanceof z.ZodError?error.issues.map(issue=>(issue.path.join('.')||'setting')+': '+issue.message).join('; '):error!==null&&typeof error==='object'&&'message'in error&&typeof error.message==='string'?error.message:String(error);
 for(const [name,value] of Object.entries(process.env))if(value&&value.length>=4&&/(?:SECRET|PASSWORD|TOKEN|API_KEY|ACCESS_KEY|MASTER_KEY)/u.test(name))message=message.replaceAll(value,'[redacted]');
 message=message.replace(/\b([a-z]+:\/\/)[^\s/@]+:[^\s/@]+@/giu,'$1[redacted]@').replace(/[\r\n\0]/gu,' ').slice(0,4096);
 const name='failure-'+new Date().toISOString().replaceAll(':','-')+'-'+process.pid+'.log';
 try{mkdirSync(directory,{recursive:true,mode:0o700});chmodSync(directory,0o700);writeFileSync(join(directory,name),message+'\n',{mode:0o600,flag:'wx'});console.error(message+' Log: '+join(display,name));}
 catch{console.error(message+' Diagnostic log could not be written to '+directory+'.');}
}

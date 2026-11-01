import {parseArgs} from 'node:util';
import {privateRead,OperatorConflict} from './common.js';
/** Explicit operator arguments, never installer settings or pairing metadata. */
export async function seedOptions(args:readonly string[]=process.argv.slice(3)){
 const {values}=parseArgs({args:[...args],options:{'target-file':{type:'string'},'fixture':{type:'string',default:'V-01'},seed:{type:'string',default:'1'},schemas:{type:'string',default:'soak_policies,soak_claims,soak_recoveries'},'source-ref':{type:'string'},'session-file':{type:'string'}},strict:true});
 if(!values['target-file'])throw new OperatorConflict('Name a private connection URI file with --target-file; seed never uses engine readiness');
 return {target:(await privateRead(values['target-file'])).trim(),fixture:values.fixture,seed:Number(values.seed),schemas:values.schemas.split(','),sourceRef:values['source-ref'],sessionFile:values['session-file']};
}

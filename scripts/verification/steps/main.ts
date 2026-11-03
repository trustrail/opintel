import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {transportFailure} from '../../steps/infrastructure/diagnostics.js';
import {parseArgs} from 'node:util';
import {randomBytes,randomUUID} from 'node:crypto';
import {createInterface} from 'node:readline/promises';
import {stdin,stdout} from 'node:process';
import {z} from 'zod';
import {PoolKeyCreationResponse} from '../../../src/shared/api/pool-keys.js';
import {CredentialKind} from '../../../src/shared/api/credential-identity.js';
import {HttpFailure,apiRequest,gatewayOrigin} from '../../steps/infrastructure/http.js';
import {privateRead,privateWrite,outputAbsent} from '../../steps/infrastructure/private-files.js';
const help:Record<string,string>={
 'sign-in':'--gateway URL --email EMAIL --session-out FILE\nRequests the normal email link. Paste it at the prompt; the link is not echoed. Saves a mode-600 session file.',
 'grant-access':'--gateway URL --project ID --pool ID --agent NAME --session-file FILE [--kind identity-bound|bearer-only] --key-out FILE\nIssues a credential using your normal administrator session. Saves its key to a new mode-600 file; never prints it.',
};
export async function run(args:readonly string[],write:(text:string)=>void=text=>stdout.write(text+'\n'),paste?:()=>Promise<string>){
 if(!args.length||args[0]==='--help'){write('Opintel verification steps\n'+Object.entries(help).map(([step,usage])=>'./steps '+step+' '+usage).join('\n\n'));return;}
 const step=args[0]??'';if(!help[step])throw new Error('Choose sign-in or grant-access. Use ./steps STEP --help.');
 if(args.includes('--help')){write(`./steps ${step} ${help[step]}`);return;}
 const fields:Record<string,readonly string[]>={'sign-in':['gateway','email','session-out'],'grant-access':['gateway','project','pool','agent','session-file','kind','key-out']};
 const options=Object.fromEntries(fields[step]!.map(name=>[name,{type:['quiet','show'].includes(name)?'boolean' as const:'string' as const}]));
 let parsed:ReturnType<typeof parseArgs>;try{parsed=parseArgs({args:[...args.slice(1)],options,strict:true,allowPositionals:false});}catch{throw new Error('Invalid flags. Use ./steps '+step+' --help.');}
 const values=parsed.values,required=(name:string)=>{const value=values[name];if(typeof value!=='string'||!value.trim())throw new Error('Missing --'+name+'.');return value;},base=gatewayOrigin(required('gateway'));
 for(const name of ['out','key-out','session-out']){const file=values[name];if(typeof file==='string')await outputAbsent(file);}
 if(step==='sign-in'){
  const email=z.email().parse(required('email')),out=required('session-out'),nonce=randomBytes(24).toString('base64url');
  await apiRequest(base,'/api/v1/auth/request-link','POST',{email,deviceNonce:nonce});
  let link:string;if(paste)link=await paste();else{const input=createInterface({input:stdin,output:stdout,terminal:false});try{link=await input.question('Open the email and paste its sign-in link here (hidden): ');}finally{input.close();}}
  const url=new URL(link.trim());if(url.origin!==base.origin||url.pathname!=='/auth/callback'||!url.searchParams.get('token'))throw new Error('Paste the unmodified sign-in link from this gateway.');
  const callback=await apiRequest(base,'/api/v1/auth/callback','POST',{token:url.searchParams.get('token'),deviceNonce:nonce});
  if(z.object({deviceMismatch:z.boolean()}).parse(callback.value).deviceMismatch)throw new Error('Device confirmation is required. Complete the normal console flow and request a new link here.');
  const cookie=callback.response.headers.getSetCookie().map(value=>value.split(';')[0]!).find(value=>/^opintel_session=[^;\s]+$/u.test(value));if(!cookie)throw new Error('The callback did not create a session; the link may be expired or consumed.');
  await apiRequest(base,'/api/v1/auth/me','GET',undefined,cookie);await privateWrite(out,cookie+'\n');write('sign-in: signed in; session saved privately.');return;
 }
 const project=z.uuid().parse(required('project'));
 if(step==='grant-access'){
  const pool=z.uuid().parse(required('pool')),label=required('agent'),out=required('key-out'),cookie=(await privateRead(required('session-file'))).trim();if(!/^opintel_session=[^;\s]+$/u.test(cookie))throw new Error('Session file must contain a normal console session cookie.');
  const credentialKind=CredentialKind.parse(values['kind']??'identity-bound');
  const reply=await apiRequest(base,`/api/v1/pools/${pool}/credentials`,'POST',{projectId:project,label,credentialKind},cookie,{'idempotency-key':randomUUID()}),issued=PoolKeyCreationResponse.parse(reply.value);if(!issued.keyShown)throw new Error('The API did not return a new key; issue a new credential.');await privateWrite(out,issued.key+'\n');write(`grant-access: credential ${issued.credentialId??issued.keyVersion} issued; key saved privately.`);return;
 }
}
function diagnostic(error:unknown){if(error instanceof HttpFailure)return error.message;const codes=['ENOENT','EACCES','EPERM','EEXIST','ELOOP','EISDIR'];if(error instanceof Error&&'code'in error&&codes.includes(String(error.code)))return 'File operation failed: '+String(error.code)+'. Check the private input/output files.';if(error instanceof z.ZodError)return 'Input or response did not match the expected format.';if(error instanceof Error&&error.constructor===Error&&!/https?:|opk_live_|opintel_session=|-----BEGIN|[A-Za-z0-9_-]{43}/u.test(error.message))return error.message;return transportFailure(error);}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))void run(process.argv.slice(2)).catch((error:unknown)=>{console.error(`${process.argv[2]??'steps'}: ${diagnostic(error)} No key material was printed.`);process.exitCode=1;});

import {fileURLToPath} from 'node:url';
import {realpathSync} from 'node:fs';
import {enrollmentIdentity} from '../steps/infrastructure/identity.js';
import {transportFailure} from '../steps/infrastructure/diagnostics.js';
import {parseArgs} from 'node:util';
import {stdout} from 'node:process';
import {join} from 'node:path';
import {parse} from 'dotenv';
import {z} from 'zod';
import {AgentIdHeader} from '../../src/shared/api/agent-presence.js';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {ResultFile,query,redeem,table,grantClaims,terminalText} from '../steps/service.js';
import {deviceAgent,ShareRefused} from '../steps/infrastructure/device.js';
import {mcpAgent} from '../steps/infrastructure/mcp.js';
import {HttpFailure,gatewayOrigin} from '../steps/infrastructure/http.js';
import {privateRead,privateWrite,outputAbsent} from '../steps/infrastructure/private-files.js';
const help:Record<string,string>={
 query:'--gateway URL --project ID --key-file FILE --agent-id NAME --sql TEXT [--out FILE] [--quiet]\nQueries one pool. --out saves the complete result and grants to a new mode-600 file. --quiet prints only the summary.',
 'redeem-and-unseal':'--result FILE --gateway URL --project ID --key-file FILE --agent-id NAME --xq-identity DIR [--out FILE] [--show]\nRedeems shares using this agent identity and credential, then unseals locally. --show explicitly prints plaintext. --out saves unsealed rows privately.',
};
export async function run(args:readonly string[],write:(text:string)=>void=text=>stdout.write(text+'\n')){
 if(!args.length||args[0]==='--help'){write('Opintel agent steps\n'+Object.entries(help).map(([step,usage])=>'./steps '+step+' '+usage).join('\n\n'));return;}
 const step=args[0]??'';if(!help[step])throw new Error('Choose query or redeem-and-unseal. Use ./steps STEP --help.');
 if(args.includes('--help')){write(`./steps ${step} ${help[step]}`);return;}
 const fields:Record<string,readonly string[]>={query:['gateway','project','key-file','agent-id','sql','out','quiet','xq-identity'],'redeem-and-unseal':['result','gateway','project','key-file','agent-id','xq-identity','out','show']};
 const options=Object.fromEntries(fields[step]!.map(name=>[name,{type:['quiet','show'].includes(name)?'boolean' as const:'string' as const}]));
 let parsed:ReturnType<typeof parseArgs>;try{parsed=parseArgs({args:[...args.slice(1)],options,strict:true,allowPositionals:false});}catch{throw new Error('Invalid flags. Use ./steps '+step+' --help.');}
 const values=parsed.values,required=(name:string)=>{const value=values[name];if(typeof value!=='string'||!value.trim())throw new Error('Missing --'+name+'.');return value;},base=gatewayOrigin(required('gateway'));
 for(const name of ['out','key-out','session-out']){const file=values[name];if(typeof file==='string')await outputAbsent(file);}
 const project=z.uuid().parse(required('project'));
 const key=(await privateRead(required('key-file'))).trim();if(!/^opk_live_[A-Za-z0-9]{22}$/u.test(key))throw new Error('Key file does not contain an issued Opintel credential.');const agentId=AgentIdHeader.parse(required('agent-id'));
 const prepared=step==='redeem-and-unseal'?ResultFile.parse(JSON.parse(await privateRead(required('result')))):null;
 if(prepared&&(prepared.project!==project||new URL(prepared.gateway).origin!==base.origin))throw new Error('Result project or gateway does not match the supplied target.');
 if(prepared&&!grantClaims(prepared.result).length)throw new Error('The result has no custody grants.');
 if(prepared&&grantClaims(prepared.result).some(g=>g.claims.custody.provider!=='xq'))throw new Error('This command requires XQ custody grants.');
 const identityDirectory=typeof values['xq-identity']==='string'?values['xq-identity']:process.env.OPINTEL_AGENT_IDENTITY;
 const identity=identityDirectory?await enrollmentIdentity(identityDirectory,process.env.STEPS_XQ_API_KEY_FILE):undefined;
 const client=await mcpAgent(base,project,key,agentId,identity);
 try{
  if(step==='query'){
   const received=await query(client.call,required('sql')),file:ResultFile={version:1,gateway:base.origin,project,agentId,...received};
   if(typeof values.out==='string')await privateWrite(values.out,JSON.stringify(file,null,2)+'\n');
   if(!values.quiet){write(received.result.columns.map(c=>`${terminalText(c.name)}: ${received.treatments[c.name]}`).join(' · '));write(table(received.result,grantClaims(received.result).flatMap(g=>g.columns)));}
   write(`query: ${received.result.rows.length} ${received.result.rows.length===1?'row':'rows'}${received.result.truncated?' (truncated)':''}; evidence ${received.result.evidenceId}.`);
   for(const g of grantClaims(received.result))write(`Grant ${g.claims.jti} · ${g.columns.map(terminalText).join(', ')} · expires ${new Date(g.claims.exp*1000).toISOString()}`);return;
  }
  const resultFile=prepared;if(!resultFile)throw new Error('No custody result was supplied.');
  const directory=identityDirectory??required('xq-identity'),entry=CertificateAssociation.parse(JSON.parse(await privateRead(join(directory,'public-association.json'))));
  const keyFile=process.env.STEPS_XQ_API_KEY_FILE;if(!keyFile)throw new Error('XQ API key file is not configured. Use ./identities add --api-key-file, or configure STEPS_XQ_API_KEY_FILE on the agent host.');const text=await privateRead(keyFile),apiKey=text.includes('OPINTEL_XQ_API_KEY=')?parse(text).OPINTEL_XQ_API_KEY??'':text.trim();
  const device=deviceAgent();try{
   const association=await device.exchange(entry.certificateId,entry.deviceName,directory,apiKey);if(association.recipientIdentifier!==entry.recipientIdentifier)throw new Error('XQ returned a different public recipient identity; nothing was redeemed.');
   const result=await redeem(resultFile,client.call,locator=>device.share(entry.certificateId,locator));
   if(typeof values.out==='string')await privateWrite(values.out,JSON.stringify({columns:resultFile.result.columns,rows:result.rows},null,2)+'\n');
   if(values.show){write(resultFile.result.columns.map(c=>`${terminalText(c.name)}: ${resultFile.treatments[c.name]??'not reported'}${resultFile.treatments[c.name]==='custody'?' (unsealed locally)':''}`).join(' · '));write(table({...resultFile.result,rows:result.rows}));}
   for(const g of result.grants)write(`Grant ${g.id} · ${g.columns.map(terminalText).join(', ')} · ${result.rows.length} ${result.rows.length===1?'row':'rows'} unsealed`);write('redeem-and-unseal: receipt state: redeemed (Opintel released K2); local unsealing succeeded.');
  }finally{device.close();}
 }finally{await client.close();}
}function diagnostic(error:unknown){if(error instanceof ShareRefused||error instanceof HttpFailure)return error.message;const codes=['ENOENT','EACCES','EPERM','EEXIST','ELOOP','EISDIR'];if(error instanceof Error&&'code'in error&&codes.includes(String(error.code)))return 'File operation failed: '+String(error.code)+'. Check the private input/output files.';if(error instanceof z.ZodError)return 'Input or response did not match the expected format.';if(error instanceof Error&&error.constructor===Error&&!/https?:|opk_live_|opintel_session=|-----BEGIN|[A-Za-z0-9_-]{43}/u.test(error.message))return error.message;return transportFailure(error);}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url))void run(process.argv.slice(2)).catch((error:unknown)=>{console.error(`${process.argv[2]??'steps'}: ${diagnostic(error)} No key material was printed.`);process.exitCode=1;});

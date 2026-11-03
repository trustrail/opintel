import {operatorDiagnostic} from '../operator/diagnostics.js';
import {parseArgs} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {z} from 'zod';
import {importIdentity} from '../operator/identity-import.js';
import {exchangeIdentity} from '../steps/identity-exchange.js';
async function main(){
 const {values,positionals}=parseArgs({options:{device:{type:'string'},'api-key-file':{type:'string'},help:{type:'boolean'}},allowPositionals:true});
 if(values.help){console.info('./identities add EXPORT.zip --api-key-file FILE [--device NAME]\nImport and exchange on the agent host only. Private and transport keys never enter gateway services.');return;}
 if(positionals[0]!=='add'||!positionals[1]||!values['api-key-file'])throw new Error('Use ./identities add EXPORT.zip --api-key-file FILE [--device NAME].');
 const root=process.env.OPINTEL_AGENT_ROOT??'/agent',original=process.env.OPINTEL_IMPORT_NAME??positionals[1];
 await importIdentity(root,positionals[1],original,values.device);
 const match=/-([1-9][0-9]*)\.zip$/iu.exec(original);if(!match)throw new Error('Original export filename required.');
 const name=values.device??'opintel-'+match[1];
 await exchangeIdentity(join(root,'identity-bundles'),name,values['api-key-file'],join(root,'public-identities.json'));
 const entries=z.array(z.object({deviceName:z.string(),bundlePath:z.string().regex(/^device-[0-9]+$/u)})).parse(JSON.parse(await readFile(join(root,'identity-bundles/certificates.json'),'utf8'))),entry=entries.find(e=>e.deviceName===name);if(!entry)throw new Error('Imported identity missing.');
 await writeFile(join(root,'active-identity'),entry.bundlePath+'\n',{mode:0o600});
}
void main().catch((error:unknown)=>{const code=error instanceof Error&&'code'in error&&['ENOENT','EACCES','EPERM','EEXIST'].includes(String(error.code))?String(error.code):'invalid input or refused exchange';operatorDiagnostic(new Error('identities add: '+code+'. Check the private input files and XQ identity. No key material was logged.'),join(process.env.OPINTEL_AGENT_ROOT??'/agent','diagnostics'));process.exitCode=1;});

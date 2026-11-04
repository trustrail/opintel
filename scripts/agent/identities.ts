import {operatorDiagnostic} from '../operator/diagnostics.js';
import {parseArgs} from 'node:util';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {privateRead,privateWrite} from '../steps/infrastructure/private-files.js';
import {CertificateAssociation} from '../../src/shared/api/certificate-association.js';
import {z} from 'zod';
import {parse} from 'dotenv';
import {importIdentity} from '../operator/identity-import.js';
import {exchangeIdentity} from '../steps/identity-exchange.js';
async function main(){
 const {values,positionals}=parseArgs({options:{device:{type:'string'},'api-key-file':{type:'string'},identity:{type:'string'},'key-file':{type:'string'},out:{type:'string'},help:{type:'boolean'}},allowPositionals:true});
 if(values.help){console.info('./identities add EXPORT.zip --api-key-file FILE [--device NAME]\n./identities export-companion --identity device-N --key-file FILE --api-key-file FILE --out FILE\nImport and exchange on the agent host only. Private and transport keys never enter gateway services.');return;}
 if(positionals[0]==='export-companion'){
  const name=values.identity;if(!name||!/^device-[1-9][0-9]*$/u.test(name)||!values['key-file']||!values['api-key-file']||!values.out)throw new Error('Use ./identities export-companion --identity device-N --key-file FILE --api-key-file FILE --out FILE.');
  const root=process.env.OPINTEL_AGENT_ROOT??'/agent',directory=join(root,'identity-bundles',name);
  const association=CertificateAssociation.parse(JSON.parse(await privateRead(join(directory,'public-association.json'))));
  if(association.certificateId!==Number(name.slice('device-'.length)))throw new Error('Identity does not match its imported certificate.');
  const [clientCert,clientKey,transportKey,poolKey,xqApiKey]=await Promise.all(['client.crt','client.key','transport.key'].map(file=>privateRead(join(directory,file))).concat([privateRead(values['key-file']),privateRead(values['api-key-file'])]));
  await privateWrite(values.out,JSON.stringify({v:1,poolKey:poolKey!.trim(),identity:{name,clientCert,clientKey,transportKey:transportKey!.trim()},xqApiKey:xqApiKey!.includes('OPINTEL_XQ_API_KEY=')?parse(xqApiKey!).OPINTEL_XQ_API_KEY??'':xqApiKey!.trim()})+'\n');console.info(values.out);return;
 }
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

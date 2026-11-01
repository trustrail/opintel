/** Internal artifact only; deliberately absent from all customer image entries. */
import {build} from 'esbuild';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,chmod} from 'node:fs/promises';
import {resolve,join,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
const destination=resolve(process.argv[2]??'tmp/internal-verifier'),revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
await mkdir(destination,{recursive:true});
const inputs=new Set();
for(const [source,name]of [['scripts/verification/verifier/main.ts','verify.js'],['scripts/soak/custody-agent.mjs','custody-agent.mjs']]){
 const bundle=await build({entryPoints:[source],outfile:join(destination,name),bundle:true,platform:'node',format:'esm',target:'node22',minify:false,sourcemap:false,metafile:true,define:{'process.env.NODE_ENV':'"production"'},banner:{js:'import {createRequire as __createRequire} from "node:module";const require=__createRequire(import.meta.url);'}});
 for(const file of Object.keys(bundle.metafile.inputs)){if(/^(?:src\/modules|src\/platform|sidecar)\//u.test(file))throw new Error('Internal verifier imported installed application implementation: '+file);inputs.add(file);}
}
await writeFile(join(destination,'README.md'),await readFile('scripts/verification/verifier/README.md'));
await writeFile(join(destination,'package.json'),'{"type":"module","private":true}\n');
await writeFile(join(destination,'verify'),'#!/bin/sh\nset -eu\ncd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexport NODE_ENV=production\nexec node verify.js "$@"\n');await chmod(join(destination,'verify'),0o755);
const identities={};for(const name of ['verify.js','custody-agent.mjs','verify','package.json','README.md'])identities[name]=createHash('sha256').update(await readFile(join(destination,name))).digest('hex');
const sourceHashes={};for(const file of [...inputs].filter(f=>!f.startsWith('node_modules/')).sort())sourceHashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(join(destination,'artifact.json'),JSON.stringify({name:'opintel-installation-verifier',version:'1.0.0',internal:true,revision,artifacts:identities,sourceHashes},null,2)+'\n');
execFileSync('tar',['-czf',destination+'.tar.gz','-C',dirname(destination),basename(destination)]);
console.info('Internal verifier: '+destination+'.tar.gz');

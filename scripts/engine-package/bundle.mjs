import process from 'node:process';
import console from 'node:console';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,copyFile,readdir,cp} from 'node:fs/promises';
import {resolve,dirname,relative,join} from 'node:path';
import {bundleMigrations} from './migrations.mjs';

const target=process.argv[2],destination=resolve(process.argv[3]??`tmp/runtime/${target}`);
const entries={
 api:{'src/platform/http/start.js':'src/platform/http/start.ts','src/platform/http/xq-worker.mjs':'src/modules/release-custody/infrastructure/xq-worker.mjs'},
 engine:{'sidecar/supervise.js':'sidecar/supervise.ts','sidecar/start.js':'sidecar/start.ts','sidecar/pin-command.js':'sidecar/pin-command.ts','sidecar/ingest/command.js':'sidecar/ingest/command.ts','sidecar/egress/readiness-policy.js':'sidecar/egress/infrastructure/readiness-policy.ts'},
 console:{'console.mjs':'deploy/images/console.mjs'},
 egress:{'egress.mjs':'deploy/engine/egress.mjs'},
 migrations:{'src/platform/db/migrate.js':'src/platform/db/migrate.ts','src/modules/authz/infrastructure/load-schema.js':'src/modules/authz/infrastructure/load-schema.ts'},
 provisioning:{'scripts/operator/ingress-tls.js':'scripts/operator/ingress-tls.ts','src/platform/ops/owner-claim.js':'src/platform/ops/owner-claim.ts','scripts/operator/provision.js':'scripts/operator/provision.ts'},
 'demo-tools':{'scripts/operator/demo.js':'scripts/operator/demo.ts','scripts/operator/custody-agent.mjs':'scripts/soak/custody-agent.mjs'},
};
if(!Object.hasOwn(entries,target))throw new Error('Unknown runtime bundle target.');
await mkdir(destination,{recursive:true});
const artifacts={};
const record=async(name)=>{artifacts[name]=createHash('sha256').update(await readFile(join(destination,name))).digest('hex');};
const definitions={'process.env.NODE_ENV':'"production"',...(['api','migrations'].includes(target)?{OPINTEL_AUTHORIZATION_SCHEMA:JSON.stringify(await readFile('docs/opintel-schema.zed','utf8'))}:{})};
if(target==='api'){
 const identities={};
 for(const file of (await readdir('migrations')).filter(file=>/\.up\.(?:sql|ts)$/u.test(file)))identities[file]=createHash('sha256').update(await readFile('migrations/'+file)).digest('hex');
 definitions.OPINTEL_MIGRATION_IDENTITIES=JSON.stringify(identities);
}
for(const [name,source] of Object.entries(entries[target])){
 const nativePath=relative(dirname(name),'native/duckdb.node').replaceAll('\\','/');
 const result=await build({entryPoints:[source],outfile:join(destination,name),bundle:true,minify:true,sourcemap:false,
  platform:'node',format:'esm',target:'node22',legalComments:'eof',metafile:true,logLevel:'warning',
  define:definitions,
  banner:{js:'import {createRequire as __opintelCreateRequire} from "node:module";const require=__opintelCreateRequire(import.meta.url);'},
  plugins:[{name:'shipping-runtime',setup(builder){
   if(target==='demo-tools')builder.onLoad({filter:/\/soak\/reinsurance\.ts$/},async()=>{let contents=await readFile('scripts/soak/reinsurance.ts','utf8');const start=contents.indexOf(' }else{\n  const {loadDevEnvironment}');const end=contents.indexOf('\n const ordered=',start);if(start<0||end<0)throw new Error('External soak boundary changed');contents=contents.slice(0,start)+' }else{throw new Error("Packaged soak requires an explicit target");}'+contents.slice(end);return {contents,loader:'ts'};});
   builder.onResolve({filter:/^@duckdb\/node-bindings$/},()=>({path:'duckdb-native',namespace:'opintel-runtime'}));
   builder.onLoad({filter:/.*/,namespace:'opintel-runtime'},()=>({contents:`import {createRequire} from 'node:module';export default createRequire(import.meta.url)(${JSON.stringify((nativePath.startsWith('.')?'':'./')+nativePath)});`,loader:'js'}));
   // Production already skips the development migration check. Keep its code
   // and CLI entrypoint out of the API bundle instead of relying on side effects.
   builder.onLoad({filter:/\/platform\/http\/development-migrations\.ts$/},()=>({contents:'export async function checkDevelopmentMigrations() {}',loader:'js'}));
  }}],
 });
 const forbidden=Object.keys(result.metafile.inputs).filter(file=>/^(?:test|e2e|reference|sidecar\/demo)\//u.test(file)||(target!=='demo-tools'&&/^scripts\/soak\//u.test(file)));
 if(forbidden.length)throw new Error('Runtime bundle contains excluded build inputs: '+forbidden.join(', '));
 await record(name);
}
await writeFile(join(destination,'package.json'),'{"type":"module","private":true}\n');await record('package.json');
if(target==='migrations')for(const file of await bundleMigrations('migrations',join(destination,'migrations')))await record('migrations/'+file);
if(['api','engine','provisioning','demo-tools'].includes(target)){
 const platform=process.env.TARGETPLATFORM;
 const names={'linux/amd64':'linux-x64','linux/arm64':'linux-arm64'};
 if(platform&&!names[platform])throw new Error('Unsupported native binding target.');
 const native=names[platform]??`${process.platform}-${process.arch}`;
 const directory=`node_modules/@duckdb/node-bindings-${native}`;
 await mkdir(join(destination,'native'),{recursive:true});
 const files=(await readdir(directory)).filter(name=>name==='duckdb.node'||name==='LICENSE'||/^libduckdb\.(?:so|dylib)$/u.test(name));
 if(!files.includes('duckdb.node'))throw new Error('Native DuckDB binding is missing.');
 for(const file of files){await copyFile(join(directory,file),join(destination,'native',file));await record('native/'+file);}
}
if(target==='engine'){
 const scanner='tmp/duckdb-extensions/postgres_scanner.duckdb_extension';
 await mkdir(dirname(join(destination,scanner)),{recursive:true});
 await copyFile(scanner,join(destination,scanner));await record(scanner);
}
if(target==='console'){
 await cp('dist',join(destination,'dist'),{recursive:true});
 const walk=async(directory)=>{for(const entry of await readdir(join(destination,directory),{withFileTypes:true})){const name=directory+'/'+entry.name;if(entry.isDirectory())await walk(name);else{if(!/\.(?:html|js|css|png)$/u.test(name))throw new Error('Unexpected console artifact: '+name);await record(name);}}};
 await walk('dist');
}
await writeFile(join(destination,'runtime-manifest.json'),JSON.stringify({version:1,target,minified:true,sourceMaps:false,artifacts},null,2)+'\n');
console.log(`Bundled ${target}: ${Object.keys(artifacts).length} explicitly recorded runtime files.`);

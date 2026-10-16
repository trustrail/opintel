import {build} from 'esbuild';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {dirname,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const lum=hex=>{const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return rgb.reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0)};
const pairs=[['Primary / ivory','#1b0232','#fbfaf7'],['Secondary / ivory','#5a4a6b','#fbfaf7'],['Primary / surface','#1b0232','#ffffff'],['Secondary / surface','#5a4a6b','#ffffff'],['Inverse / purple','#fbfaf7','#1b0232'],['Clear / action','#1b0232','#0cc655'],['Tokenized','#fbfaf7','#1f6fd0'],['Masked','#1b0232','#c8bca9'],['Aggregate only','#fbfaf7','#65417f'],['Custody','#1b0232','#b09279'],['Withheld','#fbfaf7','#1b0232'],['Undecided','#1b0232','#fff730'],['Error / ivory','#7a1428','#fbfaf7']].map(([name,fg,bg])=>({name,fg,bg,luminance:lum(bg),ratio:(Math.max(lum(fg),lum(bg))+.05)/(Math.min(lum(fg),lum(bg))+.05)}));
if(pairs.some(p=>p.ratio<4.5))throw new Error('Text contrast below AA');
await writeFile(resolve(dir,'contrast.json'),JSON.stringify(pairs,null,2)+'\n');
const result=await build({absWorkingDir:dir,entryPoints:['specimen.jsx'],bundle:true,write:false,outdir:'bundle',format:'iife',minify:true,metafile:true,loader:{'.woff2':'dataurl','.woff':'dataurl'},define:{'process.env.NODE_ENV':'"production"'}});
const js=result.outputFiles.find(f=>f.path.endsWith('.js')).text;
const css=result.outputFiles.find(f=>f.path.endsWith('.css')).text;
await writeFile(resolve(dir,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Opintel · Stage 2 component language</title><style>${css}</style></head><body id="opintel-app" data-language="next"><div id="root"></div><script>${js.replaceAll('</script','<\\/script')}</script></body></html>`);
const packages=new Set();
for(const input of Object.keys(result.metafile.inputs)){if(!input.includes('node_modules'))continue;let current=dirname(resolve(dir,input));while(current!==dirname(current)){try{const metadata=JSON.parse(await readFile(resolve(current,'package.json'),'utf8'));if(metadata.name){packages.add(current);break;}current=dirname(current);}catch{current=dirname(current);}}}
let notice='Opintel Stage 2 static specimen — third-party notices\nGenerated from bundled inputs; no direct d3 imports in specimen source.\n\n';
for(const path of [...packages].sort()){const pkg=JSON.parse(await readFile(resolve(path,'package.json'),'utf8'));const files=(await readdir(path)).filter(f=>/^(license|licence|ofl|copyright)(\.|$|-)/i.test(f));notice+=`\n=== ${pkg.name} ${pkg.version} (${pkg.license??'see license'}) ===\n`;if(!files.length)throw new Error('Missing license: '+relative(dir,path));for(const f of files)notice+=await readFile(resolve(path,f),'utf8')+'\n';}
await writeFile(resolve(dir,'THIRD-PARTY-NOTICES.txt'),notice);
await writeFile(resolve(dir,'contrast.md'),'| Pair | Foreground | Background | Background luminance | Ratio |\n|---|---|---|---:|---:|\n'+pairs.map(p=>`| ${p.name} | ${p.fg} | ${p.bg} | ${p.luminance.toFixed(4)} | ${p.ratio.toFixed(2)}:1 |`).join('\n')+'\n');
console.log(`Built static page; ${pairs.length} AA pairs; ${packages.size} bundled license notices.`);

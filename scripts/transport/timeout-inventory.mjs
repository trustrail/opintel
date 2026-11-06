import {info} from 'node:console';
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import ts from 'typescript';
const files=execFileSync('rg',['--files','src','sidecar','scripts','e2e','deploy','test'],{encoding:'utf8'}).trim().split('\n').filter(file=>/\.(?:ts|tsx|mjs|cjs|json|conf)$/u.test(file)&&!file.startsWith('src/console-next/')&&file!=='scripts/transport/timeout-inventory.mjs');
for(const file of ['playwright.config.ts','playwright.smoke.config.ts','vitest.config.ts'])files.push(file);
const rows=[];
const escaped=value=>value.replaceAll('|','\\|').replaceAll('\n',' ').replaceAll('`','').replace(/\s+/gu,' ').trim();
function context(node){for(let current=node.parent;current;current=current.parent){if(ts.isFunctionDeclaration(current)&&current.name)return current.name.text;if(ts.isMethodDeclaration(current))return current.name.getText();if(ts.isVariableDeclaration(current))return current.name.getText();}return 'module configuration';}
for(const file of [...new Set(files)].sort()){
 const text=readFileSync(file,'utf8');
 if(file.endsWith('.conf')){text.split('\n').forEach((line,index)=>{if(/\b\w*timeout\b/u.test(line)&&!line.trim().startsWith('#'))rows.push([file,index+1,'Ingress timeout',line.trim()]);});continue;}
 const source=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,file.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS),timers=new Map([['setTimeout',{index:1,kind:'timer / backoff'}],['setInterval',{index:1,kind:'periodic schedule'}]]);
 source.forEachChild(node=>{if(ts.isImportDeclaration(node)&&/node:timers/u.test(node.moduleSpecifier.getText())&&node.importClause?.namedBindings&&ts.isNamedImports(node.importClause.namedBindings)){for(const item of node.importClause.namedBindings.elements)if(['setTimeout','setInterval'].includes(item.propertyName?.text??item.name.text))timers.set(item.name.text,{index:node.moduleSpecifier.getText().includes('timers/promises')?0:1,kind:(item.propertyName?.text??item.name.text)==='setInterval'?'periodic schedule':'timer / backoff'});}});
 const add=(node,purpose,value)=>rows.push([file,source.getLineAndCharacterOfPosition(node.getStart(source)).line+1,purpose,value]);
 function visit(node){
  if(ts.isCallExpression(node)){
   const call=node.expression.getText(source);
   if(timers.has(call)){const timer=timers.get(call);add(node,`${context(node)}: ${timer.kind}`,node.arguments[timer.index]?.getText(source)??'runtime argument');}
   else if(/\.set(?:(?:Default(?:Navigation)?)?Timeout|Interval)$/u.test(call))add(node,`${context(node)}: ${call}`,node.arguments[0]?.getText(source)??'runtime argument');
   else if(call==='AbortSignal.timeout')add(node,`${context(node)}: operation cancellation`,node.arguments[0]?.getText(source)??'runtime argument');
   if(/^(?:it|test)(?:[.(]|$)/u.test(call)&&node.arguments[2])add(node,'Test case hang guard (unchanged)',node.arguments[2].getText(source));
   if(['beforeAll','beforeEach','afterEach','afterAll'].includes(call)&&node.arguments[1])add(node,`${call} hook guard (unchanged)`,node.arguments[1].getText(source));
  }
  if((ts.isPropertyAssignment(node)||ts.isVariableDeclaration(node)||ts.isParameter(node)||ts.isPropertyDeclaration(node))&&node.name&&/timeout|deadline|allowance|^until$/iu.test(node.name.getText(source))&&node.initializer)add(node,`${context(node)}: ${node.name.getText(source)}`,node.initializer.getText(source));
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsToken&&/timeout|deadline/iu.test(node.left.getText(source)))add(node,`${context(node)}: ${node.left.getText(source)}`,node.right.getText(source));
  ts.forEachChild(node,visit);
 }
 visit(source);
}
const destination='docs/timeouts.md',original=readFileSync(destination,'utf8'),marker='<!-- generated runtime timeout inventory -->';
const tableStart=original.indexOf('| Setting |'),prefix=original.slice(0,tableStart).replace(marker+'\n','').trimEnd();
const settingsRows=original.split('\n').filter(line=>line.startsWith('| `ENGINE_TRANSPORT_')).slice(0,6).join('\n');
const notesStart=original.indexOf('All settings share one definition'),notes=original.slice(notesStart).split('\n\n Timeouts and deadlines')[0].split('<!-- end runtime timeout inventory -->')[0].trim();
const output=rows.map(([file,line,purpose,value])=>`| ${file.startsWith('test/')?'Test: ':''}${escaped(purpose)} | ${escaped(value)} | Caller/configuration dependent | ${file}:${line} |`).join('\n');
writeFileSync(destination,prefix+'\n\n'+marker+'\n| Setting | Default | Accepted range | Purpose / implementation |\n|---|---|---|---|\n'+settingsRows+'\n'+output+'\n<!-- end runtime timeout inventory -->\n\n'+notes+'\n');
info(`Recorded ${rows.length} runtime timeout expressions.`);

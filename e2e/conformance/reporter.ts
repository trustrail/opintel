import {writeFileSync,mkdirSync} from 'node:fs';
import type {Reporter,TestCase,TestResult,FullResult} from '@playwright/test/reporter';
import {screenPaths,matchesScreen} from './screens.js';
import type {Scan,Finding} from './checker.js';
export default class ConformanceReporter implements Reporter{
 private scans:Omit<Scan,'findings'>[]=[];
 private findings:Finding[]=[];
 private tests:{title:string;status:string;errors:string[]}[]=[];
 onTestEnd(test:TestCase,result:TestResult){this.tests.push({title:test.title,status:result.status,errors:result.errors.map(e=>e.message??String(e))});for(const attachment of result.attachments){
  if(attachment.name!=='control-conformance'||!attachment.body)continue;
  const data=JSON.parse(attachment.body.toString()) as {scans:Omit<Scan,'findings'>[];findings:Finding[]};
  this.scans.push(...data.scans);this.findings.push(...data.findings);
 }}
 async onEnd(result:FullResult){
  const coverage=screenPaths().map(screen=>{const scans=this.scans.filter(scan=>matchesScreen(screen,scan.screen)&&scan.heading);return {screen,visited:scans.length>0,headings:[...new Set(scans.map(s=>s.heading))],states:[...new Set(scans.flatMap(s=>s.states))]};});
  const missing=coverage.filter(row=>!row.visited);
  const findings=[...new Map(this.findings.map(f=>[JSON.stringify(f),f])).values()];
  mkdirSync('test-results',{recursive:true});
  writeFileSync('test-results/control-conformance.json',JSON.stringify({status:result.status,coverage,missing,findings,tests:this.tests},null,2));
  console.log(`Control conformance: ${coverage.length-missing.length}/${coverage.length} screen routes visited; ${findings.length} distinct findings. Report: test-results/control-conformance.json`);
  if(missing.length)console.error('Unvisited screens:',missing.map(row=>row.screen).join(', '));
  return missing.length||findings.length?{status:'failed' as const}:undefined;
 }
}

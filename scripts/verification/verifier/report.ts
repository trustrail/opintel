import {diagnosticText,type Diagnostic} from './diagnostics.js';
import {writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {verifierVersion,fixtureHash,invalidCombinations,type Cell} from './registry.js';
import type {CellResult} from './scheduler.js';
export async function report(directory:string,selected:Cell[],results:CellResult[],installation:unknown,complete:boolean,extra:Record<string,unknown>={}){
 const byId=new Map(results.map(r=>[r.id,r]));
 const matrix=selected.map(c=>byId.get(c.id)??{id:c.id,capability:c.capability,dimensions:c.dimensions,expected:c.expected,expectedEvidence:c.expectedEvidence,status:'not exercised',actual:null,durationMs:0,diagnostics:['not reached']});
 const errors=(extra.errors??[]) as Diagnostic[];
 const value={verifierVersion,fixture:'V-01',fixtureHash,installation,status:complete&&!errors.some(d=>d.severity==='error')&&extra.interrupted!==true&&(!(extra.randomTraffic&&typeof extra.randomTraffic==='object'&&'failed'in extra.randomTraffic)||extra.randomTraffic.failed===0)&&matrix.every(c=>c.status==='passed')?'passed':'failed',complete,selectedCells:selected.map(c=>c.id),setupDependencies:[...new Set(selected.flatMap(c=>c.prerequisites))],invalidCombinations,counts:{selected:matrix.length,passed:matrix.filter(c=>c.status==='passed').length,failed:matrix.filter(c=>c.status==='failed').length,notExercised:matrix.filter(c=>c.status==='not exercised').length},cells:matrix,...extra};
 await writeFile(join(directory,'result.json.next'),JSON.stringify(value,null,2)+'\n',{mode:0o600});await rename(join(directory,'result.json.next'),join(directory,'result.json'));
 const escape=(s:string)=>s.replaceAll('|','\\|').replaceAll('\n',' ');
 const text=['Installation verifier '+verifierVersion,'Fixture: V-01 '+fixtureHash,'Result: '+value.status,'Complete: '+complete,'Installation: '+JSON.stringify(installation),'Selected: '+matrix.length,'','| Cell | Dimensions | Status | Expected | Actual | Receipt | ms | Diagnostics |','|---|---|---|---|---|---|---|---|',...matrix.map(c=>`| ${c.id} | ${JSON.stringify(c.dimensions)} | ${c.status} | ${c.expected.outcome} | ${c.actual?.outcome??'not exercised'} | ${c.actual?.receiptId??''} | ${c.durationMs} | ${escape(c.diagnostics.join('; '))} |`),'','Recorded diagnostics:',...errors.map(d=>escape(diagnosticText(d))),'','Invalid combinations (excluded from the cell set):',...invalidCombinations.map(v=>JSON.stringify(v)), ''];
 await writeFile(join(directory,'matrix.md'),text.join('\n'),{mode:0o600});return value;
}

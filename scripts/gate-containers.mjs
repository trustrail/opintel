import process from 'node:process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
const label='io.opintel.gate-run';
function validRun(run){if(!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/u.test(run))throw new Error('Invalid gate container ownership id.');}
export function gateContainerLabels(run=process.env.OPINTEL_GATE_RUN_ID){if(run===undefined)return [];validRun(run);return ['--label',label+'='+run];}
async function docker(args){return (await exec('docker',args,{timeout:15000,killSignal:'SIGKILL',maxBuffer:65536})).stdout;}
/** Parent-owned fallback: a terminated test launcher may never reach its finally.
 * Never select by a shared name prefix or touch an unlabelled installation. */
export async function cleanupGateContainers(run,execute=docker){
 validRun(run);
 const output=await execute(['ps','--all','--filter','label='+label+'='+run,'--format','{{.ID}}']);
 const ids=output.trim().split(/\s+/u).filter(Boolean);
 if(ids.some(id=>!/^[0-9a-f]{12,64}$/u.test(id)))throw new Error('Invalid owned-container inventory; no containers removed.');
 if(ids.length)await execute(['rm','--force',...ids]);
 return {removed:ids.length};
}

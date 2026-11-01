import {customerSoak,customerPrepare} from './customer-demo.js';
import {xqRoundTripCheck} from './xq-roundtrip.js';
import {runSoak} from './run-soak.js';
import {OperatorConflict,operatorFailure} from './common.js';
import {CustodyCheckResult} from '../../src/shared/api/release-custody.js';
import {operatorConfig,operatorApiTarget,required,privateRead,privateWrite,provisionManifest,locked,api} from './common.js';
import {seedOptions} from './seed-options.js';
import {syntheticSource} from './infrastructure/synthetic-source.js';
import {provisionReinsurance} from './reinsurance.js';
import {prepare} from './prepare.js';
async function main(){
 const command=process.argv[2];if(command==='xq-roundtrip'){await xqRoundTripCheck(process.argv[3]);return;}if(command==='customer-soak'){await customerSoak(process.argv[3],process.argv.slice(4));return;}if(command==='run-soak'){await runSoak(process.argv[3],process.argv.slice(4));return;}if(command==='--help'){console.info('demo-tools run-soak DURATION_SECONDS | seed --target-file PRIVATE_URI_FILE [--fixture V-01 --seed 1 --schemas SCHEMAS] | governance | lifecycle | lifecycle-renew | xq-check | prepare | soak; use --source-ref and --session-file for public source registration');return;}
 if(command==='seed'){const report=await syntheticSource(true,await seedOptions());await privateWrite(required('OPINTEL_SEED_MANIFEST'),report);console.info('Synthetic V-01 seeded and analyzed; compatible tables preserved');return;}
 const provision=provisionManifest.parse(JSON.parse(await privateRead(required('OPINTEL_PROVISION_MANIFEST'))));
 if(command==='xq-check'){const result=CustodyCheckResult.parse(await api(`/api/v1/projects/${provision.projectId}/custody-provider/check`,'POST',{}));await privateWrite(required('OPINTEL_OUTPUT_DIRECTORY')+'/xq-check-'+Date.now()+'.json',result);if(!result.reachable||!result.authenticated)throw new OperatorConflict('Packaged API XQ connection check failed: '+result.failure);console.info('Packaged API XQ connection check passed');return;}
 if(command==='prepare'&&process.env.OPINTEL_CUSTOMER_JOB==='1'&&!process.env.OPINTEL_OBSERVER_COOKIE){await customerPrepare();return;}
 if(command==='prepare'||command==='soak'){await prepare();if(command==='soak'){
 process.argv=[process.argv[0]!,process.argv[1]!, '--target',operatorApiTarget(),'--manifest',required('OPINTEL_SOAK_MANIFEST'),'--observer-cookie',required('OPINTEL_OBSERVER_COOKIE'),'--custody','--certs',required('OPINTEL_CERTIFICATES'),'--duration',required('OPINTEL_SOAK_DURATION'),'--agents','10','--rate',process.env.OPINTEL_SOAK_RATE??'750','--seed','1'];
 await import('../soak/reinsurance.js');}return;}
 if(command!=='governance'&&command!=='lifecycle'&&command!=='lifecycle-renew')throw new OperatorConflict('Unknown operator command');
 const config=operatorConfig.parse(JSON.parse(await privateRead(required('OPINTEL_OPERATOR_CONFIG'))));
 await locked(required('OPINTEL_SOAK_MANIFEST'),()=>provisionReinsurance(provision.projectId,provision.engineId,required('OPINTEL_CERTIFICATES'),required('OPINTEL_SOAK_MANIFEST'),config.sourceCredentialRef,command==='lifecycle'||command==='lifecycle-renew',command==='lifecycle-renew'));
}
void main().then(()=>process.exit(0)).catch((e:unknown)=>{operatorFailure(e);process.exit(1);});

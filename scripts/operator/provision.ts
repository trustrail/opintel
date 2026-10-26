import {provision} from './provision-service.js';
import {operatorFailure} from './common.js';
if(process.argv.includes('--help'))console.info('provision: uses OPINTEL_OPERATOR_CONFIG and OPINTEL_PROVISION_MANIFEST from the gateway package env');
else void provision().then(()=>process.exit(0)).catch((e:unknown)=>{operatorFailure(e);process.exit(1);});

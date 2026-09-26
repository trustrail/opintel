import { compileViews } from '../../../src/modules/entitlements/index.js';
import { generated } from './input.js';
const seed=Number(process.argv[2]);
if(!Number.isSafeInteger(seed))throw new Error('A fixture seed is required.');
process.stdout.write(JSON.stringify(compileViews(generated(seed))));

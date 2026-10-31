import {writeWorkbooks} from './verification/workbooks/write.js';
const directory=process.argv[2];
if(!directory)throw new Error('Usage: npm run demo:pack -- OUTPUT_DIRECTORY');
void writeWorkbooks(directory).then(paths=>console.info(`Wrote ${paths.length} ordinary workbook files.`)).catch((error:unknown)=>{console.error(error instanceof Error?error.message:'Workbook generation failed');process.exitCode=1;});

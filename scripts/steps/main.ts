// Development/test dispatcher only. Shipping entrypoints are package-specific.
import {run as agent} from '../agent/main.js';
import {run as verification} from '../verification/steps/main.js';
export async function run(args:readonly string[],write?:(text:string)=>void,paste?:()=>Promise<string>){return args[0]==='sign-in'||args[0]==='grant-access'?verification(args,write,paste):agent(args,write);}

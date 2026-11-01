import {readFile,lstat} from 'node:fs/promises';
import {OperatorConflict} from './conflict.js';
export async function privateRead(file:string){const st=await lstat(file);if(!st.isFile()||(st.mode&0o077))throw new OperatorConflict('Private input must be a regular mode-600 file');return readFile(file,'utf8');}

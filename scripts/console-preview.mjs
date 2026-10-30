import process from 'node:process';
import {resolve} from 'node:path';
import {createConsoleServer} from '../deploy/images/console.mjs';
createConsoleServer({root:resolve(process.argv[2]??'dist')}).listen(4173,'127.0.0.1');

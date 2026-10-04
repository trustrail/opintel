import process from 'node:process';
process.kill(process.pid, 'SIGSTOP');
await import('./target.js');

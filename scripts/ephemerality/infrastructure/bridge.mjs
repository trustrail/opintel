import {setInterval,clearInterval} from 'node:timers';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { openSync, existsSync } from 'node:fs';
// Read-only test instrumentation. Production modules remain baked in the image.
// The controller attaches before bootstrap imports or executes the target.
const server = createServer(socket => {
  const child = spawn('node', ['/work/scripts/ephemerality/infrastructure/bootstrap.mjs'], {
    stdio: ['pipe', 'pipe', openSync('/audit/sinks/target.log', 'a', 0o600)],
  });
  socket.write(JSON.stringify({ event: 'spawned', pid: child.pid }) + '\n');
  child.stdout.pipe(socket, { end: false });
  socket.pipe(child.stdin);
  child.on('close', (code, signal) => { socket.end(JSON.stringify({ event: 'exited', code, signal }) + '\n'); });
  socket.on('error', () => child.kill());
});
const waiting = setInterval(() => {
  if (!existsSync('/work/scripts/ephemerality/infrastructure/bootstrap.mjs')) return;
  clearInterval(waiting);
  server.listen(4545, '127.0.0.1');
}, 100);
createServer(socket => {
  const child = spawn('node', ['/work/scripts/ephemerality/infrastructure/deployment-probe.mjs'], {stdio:['ignore','pipe','pipe']});
  child.stdout.pipe(socket, {end:false}); child.stderr.pipe(socket, {end:false});
  child.on('exit', code => socket.end(JSON.stringify({exitCode:code})+'\n'));
  socket.on('error', ()=>child.kill());
}).listen(4546, '127.0.0.1');

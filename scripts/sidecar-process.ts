import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, unlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const exec = promisify(execFile);
function alive(pid: number): boolean {
  try { process.kill(pid,0); return true; }
  catch (error) { if (error instanceof Error && 'code' in error && error.code === 'ESRCH') return false; throw error; }
}
export async function portAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve,reject) => {
    const probe = createServer();
    probe.once('error',(error: Error & { code?: string }) => error.code === 'EADDRINUSE' ? resolve(false) : reject(error));
    probe.listen(port,host,() => probe.close(() => resolve(true)));
  });
}

/** Never signal an unrecorded listener or a PID reused by another program. */
export async function stopRecordedSidecar(options: { pidFile: string; entryPoint: string; host: string; port: number; timeoutMs: number }): Promise<void> {
  let pid: number | undefined;
  try {
    const recorded = (await readFile(options.pidFile,'utf8')).trim();
    if (!/^[1-9][0-9]*$/.test(recorded) || !Number.isSafeInteger(Number(recorded))) throw new Error(`Invalid sidecar PID file: ${options.pidFile}. Inspect it before retrying dev:up.`);
    pid = Number(recorded);
  } catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error; }
  if (pid !== undefined && alive(pid)) {
    let command: string;
    try { command = (await exec('ps',['-p',String(pid),'-o','command='])).stdout; }
    catch (error) { if (alive(pid)) throw error; command = ''; }
    if (command && !command.trim().split(/\s+/).includes(options.entryPoint))
      throw new Error(`Recorded sidecar PID ${pid} belongs to another command. Refusing to signal it; inspect ${options.pidFile}.`);
    if (alive(pid)) process.kill(pid,'SIGTERM');
  }
  const deadline = Date.now()+options.timeoutMs;
  do {
    if ((pid === undefined || !alive(pid)) && await portAvailable(options.host,options.port)) {
      if (pid !== undefined) await unlink(options.pidFile);
      return;
    }
    await delay(50);
  } while (Date.now()<deadline);
  throw new Error(`Cannot restart sidecar: ${pid === undefined ? 'no recorded PID' : `recorded PID ${pid}`} or port ${options.host}:${options.port} is still active after ${options.timeoutMs}ms. No replacement was started. Inspect the process and ${options.pidFile}; stop the listener before retrying dev:up.`);
}

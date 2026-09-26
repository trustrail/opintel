import type { PoolAccessRefusals } from '../application/binding.js';
/** Identifier-only refusal record. Query evidence persistence belongs to 5.11. */
export class InfoPoolAccessRefusals implements PoolAccessRefusals {
 async record(input:Parameters<PoolAccessRefusals['record']>[0]):Promise<void>{
  console.info({event:'pool.access_refused',...input});
 }
}

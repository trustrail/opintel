import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { z } from 'zod';
import type { SidecarOptions } from './sidecar-source-connector.js';

const clientConfig = z.strictObject({
  baseUrl: z.url().refine((value)=>new URL(value).protocol==='https:'),
  caFile:z.string().min(1), certFile:z.string().min(1), keyFile:z.string().min(1), serverPinFile:z.string().min(1),
  timeoutMs:z.number().int().min(1).max(9999).default(9000),
});
export async function loadSidecarClientOptions(file: string): Promise<SidecarOptions> {
  try {
    const config = clientConfig.parse(JSON.parse(await readFile(file,'utf8')) as unknown);
    const read = (path:string)=>readFile(resolve(dirname(file),path),'utf8');
    const [ca,cert,key,pinnedCertificate] = await Promise.all([read(config.caFile),read(config.certFile),read(config.keyFile),read(config.serverPinFile)]);
    return {baseUrl:config.baseUrl,timeoutMs:config.timeoutMs,tls:{ca,cert,key,pinnedCertificate}};
  } catch { throw new Error('Sidecar client configuration or TLS files are missing or invalid. Run npm run dev:up for local configuration.'); }
}

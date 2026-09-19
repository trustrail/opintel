import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createPrivateKey, X509Certificate } from 'node:crypto';
import { createSecureContext } from 'node:tls';
import { z } from 'zod';
import { landingZoneSchema } from './ingest/watch.js';

const milliseconds = z.number().int().min(1).max(2_147_483_647);
export const sidecarConfigSchema = z.strictObject({
  host: z.string().min(1), port: z.number().int().min(0).max(65535),
  tls: z.strictObject({ caFile: z.string().min(1), certFile: z.string().min(1), keyFile: z.string().min(1), clientPinFile: z.string().min(1) }),
  auditFile: z.string().min(1),
  limits: z.strictObject({ maxConnectionsPerSource: z.number().int().min(1).max(1000), statementTimeoutMs: milliseconds, operationTimeoutMs: milliseconds }),
  receiptUrl: z.url().refine((value) => new URL(value).protocol === 'https:').optional(),
  landingZones: z.array(landingZoneSchema).optional(),
  maxRequestBytes: z.number().int().min(1).max(16 * 1024 * 1024).default(1024 * 1024),
  shutdownTimeoutMs: milliseconds.default(10000),
}).superRefine((config, ctx) => {
  const sources = new Set<string>();
  if (config.landingZones?.length && !config.receiptUrl) ctx.addIssue({ code: 'custom', path: ['receiptUrl'], message: 'Landing requires a receipt endpoint.' });
  for (const [index, zone] of (config.landingZones ?? []).entries()) {
    if (!zone.landing) ctx.addIssue({ code: 'custom', path: ['landingZones', index, 'landing'], message: 'Landing requires source configuration and an explicit strategy.' });
    const key = zone.projectId + ':' + zone.sourceId;
    if (sources.has(key)) ctx.addIssue({ code: 'custom', path: ['landingZones', index], message: 'One landing zone per source is required.' });
    sources.add(key);
  }
});
export type SidecarConfig = z.infer<typeof sidecarConfigSchema>;
export type SidecarTls = { ca: string; cert: string; key: string; clientPin: string };

export async function loadSidecarConfig(file: string): Promise<{ config: SidecarConfig; tls: SidecarTls }> {
  let value: unknown;
  try { value = JSON.parse(await readFile(file, 'utf8')) as unknown; }
  catch { throw new Error('Sidecar configuration file is missing or is not valid JSON.'); }
  const parsed = sidecarConfigSchema.safeParse(value);
  if (!parsed.success) throw new Error(`Invalid sidecar configuration fields: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`);
  const config = parsed.data;
  const read = async (path: string) => readFile(resolve(dirname(file), path), 'utf8');
  let tls: SidecarTls;
  try {
    const [ca, cert, key, clientPin] = await Promise.all([read(config.tls.caFile), read(config.tls.certFile), read(config.tls.keyFile), read(config.tls.clientPinFile)]);
    tls = { ca, cert, key, clientPin };
    createSecureContext({ ca, cert, key, minVersion: 'TLSv1.3' });
    if (!new X509Certificate(cert).checkPrivateKey(createPrivateKey(key))) throw new Error('Key mismatch');
    for (const pem of [cert, clientPin]) {
      const certificate = new X509Certificate(pem);
      if (Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) throw new Error('Expired certificate');
    }
  } catch { throw new Error('Sidecar TLS files are missing, invalid, expired, or the server key does not match its certificate.'); }
  return { config: { ...config, auditFile: resolve(dirname(file), config.auditFile), landingZones: config.landingZones?.map((zone) => ({ ...zone, directory: resolve(dirname(file), zone.directory), stateFile: resolve(dirname(file), zone.stateFile), rulesFile: resolve(dirname(file), zone.rulesFile) })) }, tls };
}

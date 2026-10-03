import { startupCheck, StartupCheckError } from './startup-check.js';
import { SecretRef } from '../src/platform/secrets/types.js';
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
  postgresExtension:z.string().min(1).optional(),
  custody:z.strictObject({keyStore:z.string().min(1),keyEscrow:z.string().min(1)}).optional(),
  limits: z.strictObject({ maxConnectionsPerSource: z.number().int().min(1).max(1000), statementTimeoutMs: milliseconds, operationTimeoutMs: milliseconds }),
  demo: z.strictObject({ database: z.string().min(1), credentialRef: z.string().startsWith('secret://').min(10).transform(SecretRef) }).optional(),
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
  const value = await startupCheck(`configuration file ${file}`, async () => JSON.parse(await readFile(file, 'utf8')) as unknown);
  const parsed = sidecarConfigSchema.safeParse(value);
  if (!parsed.success) throw new StartupCheckError('configuration schema', `Invalid Opintel Engine configuration fields: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}.`);
  const config = parsed.data;
  const read = async (field: keyof SidecarConfig['tls']) => startupCheck(`TLS ${field}`, () => readFile(resolve(dirname(file), config.tls[field]), 'utf8'));
  const [ca, cert, key, clientPin] = await Promise.all([read('caFile'), read('certFile'), read('keyFile'), read('clientPinFile')]);
  const tls = { ca, cert, key, clientPin };
  const certificate = await startupCheck('TLS server certificate', () => new X509Certificate(cert), 'the certificate is invalid.');
  const privateKey = await startupCheck('TLS server private key', () => createPrivateKey(key), 'the private key is invalid or requires a passphrase.');
  if (!certificate.checkPrivateKey(privateKey)) throw new StartupCheckError('TLS server key', 'the private key does not match the server certificate.');
  for (const [name, pem] of [['server certificate', cert], ['client pin certificate', clientPin]] as const) {
    const certificate = await startupCheck(`TLS ${name}`, () => new X509Certificate(pem), 'the certificate is invalid.');
    if (Date.parse(certificate.validFrom) > Date.now()) throw new StartupCheckError(`TLS ${name}`, 'the certificate is not yet valid.');
    if (Date.parse(certificate.validTo) <= Date.now()) throw new StartupCheckError(`TLS ${name}`, 'the certificate has expired.');
  }
  await startupCheck('TLS secure context', () => createSecureContext({ ca, cert, key, minVersion: 'TLSv1.3' }), 'the TLS configuration is invalid.');
  return { config: { ...config, postgresExtension:config.postgresExtension?resolve(dirname(file),config.postgresExtension):undefined, custody:config.custody?{keyStore:resolve(dirname(file),config.custody.keyStore),keyEscrow:resolve(dirname(file),config.custody.keyEscrow)}:undefined, auditFile: resolve(dirname(file), config.auditFile), landingZones: config.landingZones?.map((zone) => ({ ...zone, directory: resolve(dirname(file), zone.directory), stateFile: resolve(dirname(file), zone.stateFile), rulesFile: resolve(dirname(file), zone.rulesFile) })) }, tls };
}

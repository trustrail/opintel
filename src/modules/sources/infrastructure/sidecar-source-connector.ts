import { X509Certificate } from 'node:crypto';
import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { z } from 'zod';
import { DomainError, err, ok, type ElementId, type Result } from '../../../shared/kernel/index.js';
import type { VaultRef } from '../../../platform/vault/types.js';
import type { ObjectRef, SourceConnector, SourceConnectorContext, SourceKind, TopValue } from '../application/source-connector.js';
import * as wire from './sidecar-wire.js';

export interface SidecarOptions {
  baseUrl: string;
  tls: { ca: string; cert: string; key: string; pinnedCertificate: string };
  /** Entire operation, including first-use health negotiation; always under 10s. */
  timeoutMs?: number;
}

export class SidecarSourceConnector implements SourceConnector {
  private readonly url: URL;
  private readonly timeoutMs: number;
  private readonly fingerprint: string;
  private contractChecked = false;

  constructor(readonly kind: SourceKind, private readonly context: SourceConnectorContext, private readonly options: SidecarOptions) {
    this.url = new URL(options.baseUrl);
    if (this.url.protocol !== 'https:' || this.url.username || this.url.password || this.url.search || this.url.hash) {
      throw new Error('Sidecar requires an HTTPS URL without credentials, query or fragment.');
    }
    this.timeoutMs = options.timeoutMs ?? 9_000;
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs >= 10_000) throw new Error('Sidecar timeout must be between 1 and 9999 milliseconds.');
    this.fingerprint = new X509Certificate(options.tls.pinnedCertificate).fingerprint256;
  }

  async testConnection(ref: VaultRef, signal?: AbortSignal): Promise<Result<void>> {
    const response = await this.call('/test-connection', ref, {}, wire.connectionResponse, signal);
    if (!response.ok) return response;
    // A peer's arbitrary reason can contain a connection string or password.
    // Classify common failures without reflecting untrusted text to the API.
    if (!response.value.reachable) {
      const reason = response.value.reason;
      const message = /password|credential|authenticat/i.test(reason) ? 'Source authentication failed.'
        : /timeout|timed out/i.test(reason) ? 'Source connection timed out.' : 'Source connection failed.';
      return err(new DomainError('source_unavailable', message));
    }
    return ok(undefined);
  }

  async introspect(ref: VaultRef, include: string[], signal?: AbortSignal) {
    const parsed = wire.introspectPayload.safeParse({ include });
    if (!parsed.success) return this.invalid();
    const result = await this.call('/introspect', ref, parsed.data, wire.snapshotResponse, signal);
    return result.ok ? ok(result.value.snapshot) : result;
  }

  async sampleTopValues(ref: VaultRef, elements: ElementId[], limit: number, signal?: AbortSignal): Promise<Result<Map<ElementId, TopValue[]>>> {
    if (signal?.aborted) return err(new DomainError('source_unavailable', 'Source request cancelled.'));
    const resolution = await this.context.sampling(elements);
    if (!resolution.ok) return resolution;
    if (!resolution.value.consentGiven) return err(new DomainError('forbidden', 'Sampling requires source consent.'));
    const parsed = wire.samplePayload.safeParse({ ...resolution.value, limit });
    if (!parsed.success || new Set(elements).size !== elements.length || parsed.data.elements.length !== elements.length
      || new Set(parsed.data.elements.map((element) => element.elementId)).size !== elements.length
      || parsed.data.elements.some((element) => !elements.some((id) => id === element.elementId))) return this.invalid();
    const result = await this.call('/sample', ref, parsed.data, wire.sampleResponse, signal);
    if (!result.ok) return result;
    if (Object.keys(result.value.values).some((id) => !elements.some((element) => element === id))) return this.malformed();
    const values = new Map<ElementId, TopValue[]>();
    for (const element of elements) {
      const rows = result.value.values[element];
      if (rows === undefined || rows.length > limit) return this.malformed();
      values.set(element, rows);
    }
    return ok(values);
  }

  async estimateRowCount(ref: VaultRef, object: ObjectRef, signal?: AbortSignal) {
    if (object.sourceId !== this.context.sourceId) return this.invalid();
    const parsed = wire.estimatePayload.safeParse({ object: { schema: object.schema, name: object.name } });
    if (!parsed.success) return this.invalid();
    const result = await this.call('/estimate', ref, parsed.data, wire.estimateResponse, signal);
    return result.ok ? ok(result.value.rows) : result;
  }

  private invalid(): Result<never> { return err(new DomainError('validation_failed', 'Invalid sidecar request.')); }
  private malformed(): Result<never> { return err(new DomainError('dependency_unavailable', 'Sidecar returned an invalid response.')); }

  private async call<T>(path: string, ref: VaultRef, payload: unknown, schema: z.ZodType<T>, abort?: AbortSignal): Promise<Result<T>> {
    const body = wire.envelope.safeParse({ requestId: this.context.requestId, projectId: this.context.projectId, sourceId: this.context.sourceId, credentialRef: ref, payload });
    if (!body.success) return this.invalid();
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = abort === undefined ? timeout : AbortSignal.any([timeout, abort]);
    if (signal.aborted) return err(new DomainError('source_unavailable', 'Source request cancelled.'));
    try {
      if (!this.contractChecked) {
        const health = wire.healthResponse.safeParse(await this.post('/health', undefined, signal));
        if (!health.success) return this.malformed();
        if (health.data.contract !== 1) return err(new DomainError('dependency_unavailable', 'Sidecar contract mismatch: this application requires contract 1.'));
        this.contractChecked = true;
      }
      const response = schema.safeParse(await this.post(path, body.data, signal));
      return response.success ? ok(response.data) : this.malformed();
    } catch {
      return err(new DomainError('source_unavailable', abort?.aborted ? 'Source request cancelled.' : signal.aborted ? 'Source connection timed out.' : 'Sidecar connection failed or returned an invalid response.', undefined, true));
    }
  }

  private post(path: string, body: unknown, signal: AbortSignal): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      const req = request(new URL(path, this.url), {
        method: 'POST', agent: false, signal,
        ca: this.options.tls.ca, cert: this.options.tls.cert, key: this.options.tls.key,
        minVersion: 'TLSv1.3', rejectUnauthorized: true,
        checkServerIdentity: (host, cert) => {
          const error = checkServerIdentity(host, cert);
          if (error) return error;
          return cert.fingerprint256 === this.fingerprint ? undefined : new Error('Sidecar certificate pin mismatch.');
        },
        headers: encoded === undefined ? {} : { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) },
      }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('error', reject);
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > 16 * 1024 * 1024) { res.destroy(new Error('Sidecar response too large.')); return; }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (res.statusCode !== 200 || !/^application\/json(?:\s*;|$)/i.test(res.headers['content-type'] ?? '')) { reject(new Error('Invalid sidecar response.')); return; }
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown); } catch { reject(new Error('Invalid sidecar JSON.')); }
        });
      });
      req.on('error', reject);
      req.end(encoded);
    });
  }
}

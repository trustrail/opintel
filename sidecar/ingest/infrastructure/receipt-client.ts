import { request } from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { X509Certificate } from 'node:crypto';
import { serviceErrorEnvelope } from '../../../src/shared/error-contract.js';
import { DomainError, err, ok, type ProjectId, type Result } from '../../../src/shared/kernel/index.js';
import { arrivalNoticeSchema, reconciliationReportSchema, landingReceiptSchema, type ArrivalNotice, type ReconciliationReport, type LandingReceipt } from '../../../src/shared/landing-contract.js';
import type { LandingReceiptPort } from '../landing-port.js';
export class HttpsLandingReceipts implements LandingReceiptPort {
  private readonly url: URL;
  private readonly pin: string;
  constructor(url: string, private readonly tls: { ca: string; cert: string; key: string; pinnedCertificate: string }) {
    this.url = new URL(url);
    if (this.url.protocol !== 'https:' || this.url.username || this.url.password || this.url.search || this.url.hash) throw new Error('Receipt endpoint must use HTTPS without credentials.');
    this.pin = new X509Certificate(tls.pinnedCertificate).fingerprint256;
  }
  async send(receipt: LandingReceipt): Promise<Result<void>> {
    return this.post('/landing-receipt', landingReceiptSchema.parse(receipt));
  }
  notice(notice: ArrivalNotice): Promise<Result<void>> { return this.post('/arrival-notice', arrivalNoticeSchema.parse(notice)); }
  reconcile(report: ReconciliationReport, projectId: ProjectId): Promise<Result<void>> { return this.post('/reconciliation-report', reconciliationReportSchema.parse(report), projectId); }
  private async post(path: string, payload: unknown, projectId?: ProjectId): Promise<Result<void>> {
    const body = JSON.stringify(payload);
    try {
      return await new Promise<Result<void>>((resolve, reject) => {
        const req = request(new URL(path, this.url), { method: 'POST', ...this.tls, agent: false, minVersion: 'TLSv1.3', rejectUnauthorized: true,
          signal: AbortSignal.timeout(9000), headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), ...(projectId ? { 'x-opintel-project-id': projectId } : {}) },
          checkServerIdentity: (host, cert) => checkServerIdentity(host, cert) ?? (cert.fingerprint256 === this.pin ? undefined : new Error('Receipt certificate pin mismatch.')),
        }, (res) => {
          const chunks: Buffer[] = []; let size = 0;
          res.on('error', reject);
          res.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 65536) res.destroy(new Error('Receipt response too large.')); else chunks.push(chunk); });
          res.on('end', () => {
            if (res.statusCode === 204) { resolve(ok(undefined)); return; }
            try {
              const envelope = serviceErrorEnvelope.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown);
              resolve(err(new DomainError(envelope.error.code, envelope.error.message, undefined, envelope.error.retryable)));
            } catch { reject(new Error('Invalid receipt response.')); }
          });
        }); req.on('error', reject); req.end(body);
      });
    } catch { return err(new DomainError('dependency_unavailable', 'Landing is committed but its receipt could not be registered.')); }
  }
}

import { z } from 'zod';
import { ProjectId } from '../../../shared/kernel/index.js';
import type { FilingRegisterRepository } from '../application/register.js';
import { createServer } from 'node:https';
import { X509Certificate, randomUUID } from 'node:crypto';
import type { TLSSocket } from 'node:tls';
import { arrivalNoticeSchema, reconciliationReportSchema, landingReceiptSchema } from '../../../shared/landing-contract.js';
import type { AcceptLandingReceipt } from '../application/landing-receipts.js';

export function createLandingReceiptServer(tls: { ca: string; cert: string; key: string; pinnedCertificate: string }, service: AcceptLandingReceipt, register?: FilingRegisterRepository) {
  const routes = ['/landing-receipt', ...(register ? ['/arrival-notice', '/reconciliation-report'] : [])]
    .map((path) => ({ path, permission: 'pinned_sidecar_certificate' as const }));
  for (const route of routes) if (route.permission !== 'pinned_sidecar_certificate') throw new Error('Ingest routes must declare their certificate permission.');
  const pin = new X509Certificate(tls.pinnedCertificate).fingerprint256;
  return createServer({ ...tls, minVersion: 'TLSv1.3', requestCert: true, rejectUnauthorized: true }, (req, res) => {
    const requestId = randomUUID();
    const fail = (status: number, code: string, message: string) => {
      const event = { event: status >= 500 ? 'landing.receipt_failed' : 'landing.receipt_refused', code, requestId };
      if (status >= 500) console.warn(event); else console.info(event);
      res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { code, message, requestId, retryable: status >= 500 } }));
    };
    const socket = req.socket as TLSSocket;
    if (!socket.authorized || socket.getPeerCertificate().fingerprint256 !== pin) { socket.destroy(); return; }
    if (req.method !== 'POST' || !routes.some((route) => route.path === req.url)) { req.resume(); fail(404, 'not_found', 'The endpoint does not exist.'); return; }
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) { req.resume(); fail(415, 'validation_failed', 'A JSON receipt is required.'); return; }
    void (async () => {
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) {
          const bytes = Buffer.from(chunk as Uint8Array); size += bytes.length;
          if (size > 65536) { fail(413, 'validation_failed', 'The receipt is too large.'); req.destroy(); return; }
          chunks.push(bytes);
        }
        let body: unknown;
        try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown; }
        catch { fail(400, 'validation_failed', 'The receipt is not valid JSON.'); return; }
        const result = await (async () => {
          if (req.url === '/arrival-notice' && register) {
            const parsed = arrivalNoticeSchema.safeParse(body);
            if (!parsed.success) return null;
            return register.notice(parsed.data);
          }
          if (req.url === '/reconciliation-report' && register) {
            const parsed = reconciliationReportSchema.safeParse(body);
            const project = z.uuid().safeParse(req.headers['x-opintel-project-id']);
            if (!parsed.success || !project.success) return null;
            return register.reconcile(parsed.data, ProjectId(project.data));
          }
          const parsed = landingReceiptSchema.safeParse(body);
          return parsed.success ? service.execute(parsed.data) : null;
        })();
        if (!result) { fail(400, 'validation_failed', 'The notice did not pass validation.'); return; }
        if (!result.ok) { fail(result.error.code === 'not_found' ? 404 : 409, result.error.code, result.error.message); return; }
        res.writeHead(204); res.end();
      } catch { fail(503, 'dependency_unavailable', 'Landing receipt could not be registered.'); }
    })();
  });
}

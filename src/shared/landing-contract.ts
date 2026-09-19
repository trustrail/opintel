import { z } from 'zod';
import { FilingId, ProjectId, SourceId } from './kernel/index.js';
const id = z.uuid().refine((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
export const landingStrategySchema = z.enum(['append_as_at', 'table_per_filing']);
export const landingReceiptSchema = z.strictObject({
  filingId: id.transform(FilingId), sourceId: id.transform(SourceId), projectId: id.transform(ProjectId),
  partyCode: z.string().min(1), kind: z.string().min(1), period: z.string().min(1),
  asAt: z.iso.date().nullable(), strategy: landingStrategySchema, landedTable: z.string().min(1),
  rowCount: z.number().int().nonnegative().safe(), fileSha256: z.string().regex(/^[a-f0-9]{64}$/),
  supersedes: id.transform(FilingId).nullable(), landedAt: z.iso.datetime(),
});
export type LandingReceipt = z.infer<typeof landingReceiptSchema>;

export function landingReceiptOpenApiDocument() {
  return { openapi: '3.1.0', info: { title: 'Opintel landing receipts', version: '1' },
    components: { securitySchemes: { sidecarCertificate: { type: 'mutualTLS' } } },
    paths: { '/landing-receipt': { post: { security: [{ sidecarCertificate: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(landingReceiptSchema, { io: 'input' }) } } },
      responses: { '204': { description: 'Receipt durably accepted (including identical retries).' },
        '409': { description: 'Receipt refused; customer rows remain landed.' }, '503': { description: 'Registration unavailable; retry the same receipt.' } },
    } } } };
}

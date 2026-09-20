import { z } from 'zod';
import { FilingId, ProjectId, SourceId } from './kernel/value-objects.js';
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
    components: { securitySchemes: { sidecarCertificate: { type: 'mutualTLS' }, sessionCookie: { type: 'apiKey', in: 'cookie', name: 'opintel_session' } } },
    paths: {
      '/arrival-notice': { post: noticeOperation(arrivalNoticeSchema) },
      '/reconciliation-report': { post: { ...noticeOperation(reconciliationReportSchema), parameters: [{ name: 'x-opintel-project-id', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } }] } },
      '/api/v1/projects/{id}/filings': { get: {
        description: 'Requires project#view. Cursor pagination by filing ID.', security: [{ sessionCookie: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'cursor', in: 'query', schema: { type: 'string' } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1 } }],
        responses: { '200': { description: 'Filing register projection.', content: { 'application/json': { schema: z.toJSONSchema(filingListResponseSchema, { io: 'input' }) } } } },
      } },
      '/landing-receipt': { post: { security: [{ sidecarCertificate: [] }],
      requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(landingReceiptSchema, { io: 'input' }) } } },
      responses: { '204': { description: 'Receipt durably accepted (including identical retries).' },
        '409': { description: 'Receipt refused; customer rows remain landed.' }, '503': { description: 'Registration unavailable; retry the same receipt.' } },
    } } } };
}

export const quarantineCategorySchema = z.enum(['no_rule_matched', 'multiple_rules_matched', 'unreadable_format', 'sheet_absent', 'merged_header', 'formula_uncached', 'locale_undeclared', 'period_unparseable', 'verification_mismatch', 'column_type_changed', 'rule_invalid', 'attribution_missing', 'header_invalid']);
export const arrivalNoticeSchema = z.strictObject({
  filingId: id.transform(FilingId), sourceId: id.transform(SourceId), projectId: id.transform(ProjectId),
  fileSha256: z.string().regex(/^[a-f0-9]{64}$/), receivedAt: z.iso.datetime({ offset: true }),
  revision: z.number().int().positive().safe(), outcome: z.enum(['pending', 'landed', 'quarantined', 'duplicate']),
  partyCode: z.string().nullable(), kind: z.string().min(1).nullable(), period: z.string().nullable(),
  quarantineCategory: quarantineCategorySchema.nullable(),
});
export type ArrivalNotice = z.infer<typeof arrivalNoticeSchema>;
export const reconciliationReportSchema = z.strictObject({
  sourceId: id.transform(SourceId), zoneFileCount: z.number().int().nonnegative().safe(),
  registeredCount: z.number().int().nonnegative().safe(), unregisteredCount: z.number().int().nonnegative().safe(), checkedAt: z.iso.datetime({ offset: true }),
}).refine((v) => v.zoneFileCount === v.registeredCount + v.unregisteredCount);
export type ReconciliationReport = z.infer<typeof reconciliationReportSchema>;
export const filingListItemSchema = arrivalNoticeSchema.omit({ projectId: true, fileSha256: true }).extend({
  supersedes: id.nullable(), rowCount: z.number().int().nonnegative().nullable(),
}).strip();
export const filingListResponseSchema = z.object({ items: z.array(filingListItemSchema), nextCursor: z.string().nullable() });

function noticeOperation(schema: z.ZodType) {
  return { security: [{ sidecarCertificate: [] }],
    requestBody: { required: true, content: { 'application/json': { schema: z.toJSONSchema(schema, { io: 'input' }) } } },
    responses: { '204': { description: 'Accepted; stale updates discarded.' }, '409': { description: 'Refused.' }, '503': { description: 'Unavailable; retry.' } } };
}

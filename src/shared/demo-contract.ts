import { z } from 'zod';
import { DemoSourceId } from './kernel/index.js';
import { SecretRef } from '../platform/secrets/types.js';
const name = z.string().min(1).max(63);
export const schemaSpecSchema = z.strictObject({ schemas: z.array(z.strictObject({ name,
  objects: z.array(z.strictObject({ name, kind: z.enum(['table', 'view']), columns: z.array(z.strictObject({
    name, type: z.string().min(1), nullable: z.boolean(), isKey: z.boolean().optional(), description: z.string().optional(),
  })).min(1) })).min(1),
})).min(1) });
const key = z.string().regex(/^[a-zA-Z0-9_-]+$/).max(63);
export const generatorSpecSchema = z.strictObject({ seed: z.number().int().safe(),
  rows: z.record(z.string(), z.number().int().min(1).max(10000)),
  joinKeys: z.array(z.strictObject({ objects: z.array(z.string()), column: name, cardinality: z.number().int().positive() })),
  columns: z.record(z.string(), z.strictObject({ distribution: z.enum(['uniform', 'zipf', 'normal']).optional(), values: z.array(z.string()).min(1).optional(), nullRate: z.number().min(0).max(1).optional() })).optional(),
  files: z.array(z.strictObject({ id: key, party: key, kind: z.string().min(1).max(63), period: key, sheetName: z.string().min(1).max(31), headerRow: z.number().int().min(1).max(100),
    decimalSeparator: z.enum(['.', ',']), dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']),
    mergedHeader: z.boolean().optional(), supersedes: key.optional(), dependsOn: key.optional(),
  })).max(100).optional(),
}).superRefine((spec, ctx) => {
  const files = spec.files ?? []; const seen = new Set<string>();
  for (const [index, file] of files.entries()) {
    if (seen.has(file.id)) ctx.addIssue({ code: 'custom', path: ['files',index,'id'], message: 'File IDs must be unique.' });
    for (const dependency of [file.dependsOn,file.supersedes]) if (dependency && !seen.has(dependency)) ctx.addIssue({ code: 'custom', path: ['files',index], message: 'Dependencies must name a preceding file.' });
    if (file.supersedes) {
      const prior = files.find((entry) => entry.id === file.supersedes);
      if (file.dependsOn !== file.supersedes || !prior || prior.party !== file.party || prior.kind !== file.kind || prior.period !== file.period)
        ctx.addIssue({ code: 'custom', path: ['files',index], message: 'A restatement must depend on the preceding filing with the same party, kind and period.' });
    }
    seen.add(file.id);
  }
});
export const provisionDemoPayload = z.strictObject({ templateId: z.uuid().transform(DemoSourceId), schemaSpec: schemaSpecSchema, generatorSpec: generatorSpecSchema, landingZone: z.string().min(1).nullable() });
export const provisionDemoResponse = z.strictObject({ credentialRef: z.string().startsWith('secret://').min(10).transform(SecretRef), database: z.string().min(1) });
export type SchemaSpec = z.infer<typeof schemaSpecSchema>;
export type GeneratorSpec = z.infer<typeof generatorSpecSchema>;
export type ProvisionDemoPayload = z.infer<typeof provisionDemoPayload>;
export type ProvisionDemoResponse = z.infer<typeof provisionDemoResponse>;

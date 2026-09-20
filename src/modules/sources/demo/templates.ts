import { withPlatform } from '../../../platform/db/scope.js';
import { z } from 'zod';
import { schemaSpecSchema, generatorSpecSchema } from '../../../shared/demo-contract.js';
import { DomainError, err, ok, DemoSourceId, type IndustryId } from '../../../shared/kernel/index.js';
const templateSchema = z.object({ id: z.uuid().transform(DemoSourceId), name: z.string(), narrative: z.string().nullable(), schemaSpec: schemaSpecSchema, generatorSpec: generatorSpecSchema, packVersion: z.number().int() });
export async function readDemoTemplate(industryId: IndustryId, templateId: DemoSourceId) {
  return withPlatform(async (tx) => {
    const [row] = await tx.query(`SELECT id,name,narrative,schema_spec AS "schemaSpec",generator_spec AS "generatorSpec",pack_version AS "packVersion"
      FROM demo_source_template WHERE id=$1 AND industry_id=$2 AND active`, [templateId,industryId]);
    return row ? ok(templateSchema.parse(row)) : err(new DomainError('not_found','The industry demo template does not exist.'));
  });
}

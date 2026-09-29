import {z} from 'zod';
import {projectSettingSchema} from '../../../shared/project-settings.js';
import type {EvidenceTextPort} from './read.js';
export const storedRedactionPolicy=z.object({redaction:projectSettingSchema('evidence.redaction').pipe(z.enum(['aggressive','allowlist','none'])),allowlistedFields:projectSettingSchema('evidence.allowlistedFields').pipe(z.array(z.string()))});
export type StoredRedactionPolicy=z.infer<typeof storedRedactionPolicy>;
export function evidencePolicy(settings:unknown):StoredRedactionPolicy{
 const parsed=z.object({evidence:storedRedactionPolicy.default({redaction:'aggressive',allowlistedFields:[]})}).safeParse(settings);
 return parsed.success?parsed.data.evidence:{redaction:'aggressive',allowlistedFields:[]};
}
export async function storedArgument(text:string|null,field:'sql'|'prompt',policy:StoredRedactionPolicy,parser:EvidenceTextPort):Promise<string|null>{
 if(text===null||policy.redaction==='none')return text;
 if(policy.redaction==='allowlist'&&field==='sql'&&policy.allowlistedFields.includes('sql'))return parser.stripSql(text);
 return null;
}

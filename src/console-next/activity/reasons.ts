import type {ErrorCode} from '../../shared/kernel/index.js';
import type {EvidenceDetail} from '../../shared/api/activity.js';
/** Exhaustive for the codes accepted by EvidenceFinish; historical codes stay safe. */
export const refusalSentences={
 unauthenticated:'The request did not have a valid credential.',
 forbidden:'Permission was denied for this request.',
 not_found:'A resource needed for this request could not be found.',
 validation_failed:'The request did not pass validation.',
 conflict:'The request conflicted with another change.',
 idempotency_key_reused:'The request reused an operation key for a different operation.',
 rate_limited:'Too many requests were made in a short time.',
 dependency_unavailable:'A required service was unavailable for this request.',
 entitlement_missing:'Asked for a column with no decision for this pool.',
 element_withheld:'Asked for a column this pool withholds.',
 object_unavailable:'A table needed for this request was unavailable.',
 unsupported_on_token:'Asked for an operation that cannot run on tokenized values.',
 unsupported_on_aggregate_only:'Asked to read a column that can only be used in an aggregate.',
 term_unresolved:'A term in the request could not be resolved.',
 clarification_required:'The request needs clarification before it can run.',
 domain_knowledge_gap:'The request needs domain knowledge that is not available.',
 sources_cannot_be_joined:'The requested sources cannot be joined.',
 large_result_confirmation:'The result needs confirmation before it can be returned.',
 budget_exceeded:"The pool's query limits did not allow this request.",
 engine_saturated:'The engine cannot accept another query right now.',
 source_unavailable:'A source needed for this request was unavailable.',
 sql_not_permitted:'Asked for a SQL statement this pool does not allow.',
 unsupported_pushdown:'The source scan could not be completed within its limits.',
 memory_exhausted:'The request needed more memory than allowed.',
} satisfies Record<ErrorCode,string>&Record<string,string>;
export function refusalSentence(r:EvidenceDetail){const code=r.refusalCode;return code&&Object.hasOwn(refusalSentences,code)?refusalSentences[code as keyof typeof refusalSentences]:r.metadata.refusal?.message??'Reason not captured';}
export function refusalColumns(r:EvidenceDetail){return [...new Set([
 ...(r.metadata.refusal?.candidate?.columns.map(c=>c.name)??[]),
 ...r.elements.filter(e=>r.refusalCode==='element_withheld'?e.state==='withheld':r.refusalCode==='entitlement_missing'?e.state==='undecided':false).map(e=>e.exposedName),
 ])];}
/** Keep the existing event count; state is the latest recorded lifecycle event. */
export function custodyChip(r:EvidenceDetail){const lifecycle=r.releaseEvents.filter(e=>['granted','revoked','expired'].includes(e.kind)).at(-1);return `${r.releaseEvents.length} ${r.releaseEvents.length===1?'release':'releases'}${lifecycle?' · '+lifecycle.kind:''}`;}

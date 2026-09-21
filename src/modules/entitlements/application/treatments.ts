import type { DuckDbType } from '../../catalog/index.js';
import { DomainError, err, ok, type ElementId, type Result } from '../../../shared/kernel/index.js';
import type { Entitlement, MaskKind } from '../domain/entitlement.js';
import { maskValue } from '../domain/masks.js';
import { validateMaskType } from './mask-compatibility.js';
import type { TokenizerPort } from './tokenizer-port.js';
export type TreatmentStrategy =
 | { kind: 'omitted'; reason: 'undecided' | 'withheld' | 'unsupported'; outputType: null }
 | { kind: 'clear'; outputType: DuckDbType; apply(value: unknown): Promise<Result<unknown>> }
 | { kind: 'tokenized'; outputType: 'VARCHAR'; apply(value: unknown): Promise<Result<string | null>> }
 | { kind: 'masked'; maskKind: MaskKind; outputType: 'VARCHAR'; apply(value: unknown): Promise<Result<string | null>> }
 | { kind: 'aggregate_only'; outputType: DuckDbType; constraint: { kind: 'aggregate_only'; elementId: ElementId } };
/** Per-element semantics only. No SQL, view assembly, query inspection or UDF registration. */
export class TreatmentStrategies {
 constructor(private readonly tokenizer?: TokenizerPort) {}
 resolve(element: { id: ElementId; type: DuckDbType | null }, decision: Entitlement | null): Result<TreatmentStrategy> {
  if (decision && decision.state.elementId !== element.id) return err(new DomainError('validation_failed','The decision belongs to another element.'));
  if (element.type === null) return ok({kind:'omitted',reason:'unsupported',outputType:null});
  if (decision === null) return ok({kind:'omitted',reason:'undecided',outputType:null});
  const state=decision.state;
  switch (state.treatment) {
   case 'clear': return ok({kind:'clear',outputType:element.type,apply:async value=>ok(value)});
   case 'withheld': return ok({kind:'omitted',reason:'withheld',outputType:null});
   case 'aggregate_only': return ok({kind:'aggregate_only',outputType:element.type,constraint:{kind:'aggregate_only',elementId:element.id}});
   case 'masked': {
    const kind=state.maskKind;
    if (kind === null) return err(new DomainError('validation_failed','The masked decision needs an explicit mask kind.'));
    const valid=validateMaskType(kind,element.type);if(!valid.ok)return valid;
    return ok({kind:'masked',maskKind:kind,outputType:'VARCHAR',apply:async value=>maskValue(kind,value)});
   }
   case 'tokenized': {
    const tokenizer=this.tokenizer;
    if (!tokenizer) return err(new DomainError('dependency_unavailable','Tokenization is unavailable. Configure the tokenizer before releasing tokenized values.'));
    return ok({kind:'tokenized',outputType:'VARCHAR',apply:value=>tokenizer.tokenize({projectId:state.projectId,elementId:element.id,value})});
   }
  }
 }
}

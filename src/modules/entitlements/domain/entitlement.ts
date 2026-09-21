import { DomainError, err, ok, type Result, type PoolId, type ElementId, type ProjectId, type ActorRef, type Timestamp } from '../../../shared/kernel/index.js';
export const treatments = ['clear', 'tokenized', 'masked', 'aggregate_only', 'withheld'] as const;
export type Treatment = typeof treatments[number];
export type DecisionActor = Exclude<ActorRef, { kind: 'system' }>;
export type EntitlementState = Readonly<{
 poolId: PoolId; elementId: ElementId; projectId: ProjectId;
 treatment: Treatment; setBy: DecisionActor; setAt: Timestamp; justification: string | null;
}>;
/** There is deliberately no reset or delete command. */
export class Entitlement {
 private constructor(readonly state: EntitlementState) {}
 static decide(state: EntitlementState): Result<Entitlement> {
  if (!treatments.includes(state.treatment)) return err(new DomainError('validation_failed', 'Choose a treatment. An entitlement cannot be reset to undecided.'));
  if (!['user', 'rule'].includes(state.setBy.kind) || !state.setBy.id.trim()) return err(new DomainError('validation_failed', 'A decision must name the user or rule that made it.'));
  return ok(new Entitlement(Object.freeze({poolId:state.poolId,elementId:state.elementId,projectId:state.projectId,treatment:state.treatment,setBy:Object.freeze({...state.setBy}),setAt:state.setAt,justification:state.justification})));
 }
}

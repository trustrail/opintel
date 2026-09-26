import { withTenant } from '../../../platform/db/scope.js';
import { DomainError, err, ok, Timestamp, type IdFactory, type RuleId, type PoolId, type ElementId, type Result } from '../../../shared/kernel/index.js';
import type { EntitlementContext } from '../application/entitlement-repository.js';
import { patternRuleInput, selectPatternRule, validateRuleTreatment, type PatternRule, type RuleElement } from '../application/rules.js';
import type { IntrospectionCompleted, IntrospectionCompletedHandler } from '../../sources/index.js';

type RuleRow = Omit<PatternRule, 'createdAt'> & { createdAt: Date };
const columns = `id,project_id AS "projectId",matcher,match_kind AS "matchKind",treatment,priority,active,created_at AS "createdAt",mask_kind AS "maskKind"`;
const hydrate = (row: RuleRow): PatternRule => ({ ...row, createdAt: Timestamp(row.createdAt) });

export class PostgresPatternRules implements IntrospectionCompletedHandler {
  constructor(private readonly ids: IdFactory) {}

  async create(ctx: EntitlementContext, input: unknown): Promise<Result<PatternRule>> {
    const parsed = patternRuleInput.safeParse(input);
    if (!parsed.success) return err(new DomainError('validation_failed', parsed.error.issues[0]?.message ?? 'Invalid pattern rule.'));
    const r = parsed.data;
    return withTenant(ctx, async tx => {
      const [row] = await tx.query<RuleRow>(`INSERT INTO pattern_rule(id,project_id,matcher,match_kind,treatment,priority,active,mask_kind)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING ${columns}`, [this.ids.create<RuleId>(),ctx.projectId,r.matcher,r.matchKind,r.treatment,r.priority,r.active,r.maskKind]);
      return ok(hydrate(row!));
    });
  }

  delete(ctx: EntitlementContext, id: RuleId): Promise<Result<void>> {
    return withTenant(ctx, async tx => {
      const rows = await tx.query('DELETE FROM pattern_rule WHERE id=$1 RETURNING id', [id]);
      // source_ref and historical rule_ids intentionally have no rule FK.
      return rows.length ? ok(undefined) : err(new DomainError('not_found', 'The pattern rule was not found.'));
    });
  }

  async handle(ctx: EntitlementContext, event: IntrospectionCompleted): Promise<void> {
    if (event.projectId !== ctx.projectId) throw new Error('Introspection event project does not match its tenant scope.');
    // One entitlement aggregate per transaction. The event is acknowledged only
    // after every durable target has a receipt; partial retries resume safely.
    for (;;) {
      const targets = await withTenant(ctx, tx => tx.query<{poolId:PoolId;elementId:ElementId}>(`SELECT pool_id AS "poolId",element_id AS "elementId"
        FROM pattern_rule_application WHERE run_id=$1 AND processed_at IS NULL ORDER BY pool_id,element_id LIMIT 100`, [event.runId]));
      if (!targets.length) break;
      for (const target of targets) await this.apply(ctx, event, target.poolId, target.elementId);
    }
  }

  private apply(ctx: EntitlementContext, event: IntrospectionCompleted, poolId: PoolId, elementId: ElementId): Promise<void> {
    let refusal: { ruleIds: readonly RuleId[]; reason: string } | undefined;
    return withTenant(ctx, async tx => {
      // Same source -> element lock ordering as manual decisions and publication.
      const sources = await tx.query<{status:string}>('SELECT status FROM data_source WHERE id=$1 FOR UPDATE', [event.sourceId]);
      const [receipt] = await tx.query<{processed_at:Date|null}>(`SELECT processed_at FROM pattern_rule_application WHERE run_id=$1 AND pool_id=$2 AND element_id=$3 FOR UPDATE`, [event.runId,poolId,elementId]);
      if (!receipt || receipt.processed_at !== null) return;
      const [element] = await tx.query<RuleElement>(`SELECT e.id,e.exposed_name AS "exposedName",e.exposed_type AS "exposedType",o.exposed_schema AS "exposedSchema",
        e.token_domain AS "tokenDomain",e.case_insensitive AS "caseInsensitive",e.canon_id AS "canonId",e.epoch_unit AS "epochUnit",
        COALESCE(e.source_timezone,t.source_timezone) AS "sourceTimezone"
        FROM catalog_element e JOIN catalog_object o ON o.id=e.object_id
        LEFT JOIN catalog_schema_temporal t ON t.source_id=o.source_id AND t.schema_name=o.schema_name
        WHERE e.id=$1 AND o.source_id=$2 AND e.status='active' AND o.status='active' FOR UPDATE OF e`, [elementId,event.sourceId]);
      const finish = async (ruleIds: readonly RuleId[] = [], message: string | null = null) => {
        await tx.query(`UPDATE pattern_rule_application SET processed_at=now(),rule_ids=$4,element_name=$5,message=$6
          WHERE run_id=$1 AND pool_id=$2 AND element_id=$3`, [event.runId,poolId,elementId,ruleIds,element?.exposedName ?? null,message]);
        if (message !== null) refusal={ruleIds,reason:ruleIds.length>1?'equal_priority':'inapplicable_treatment'};
      };
      const binding = await tx.query('SELECT pool_id FROM pool_source_binding WHERE pool_id=$1 AND source_id=$2 FOR SHARE', [poolId,event.sourceId]);
      const existing = await tx.query('SELECT pool_id FROM entitlement WHERE pool_id=$1 AND element_id=$2', [poolId,elementId]);
      if (!element || sources[0]?.status === 'archived' || !binding.length || existing.length) { await finish(); return; }
      const rows = await tx.query<RuleRow>(`SELECT ${columns} FROM pattern_rule
        WHERE active AND created_at < (SELECT discovered_at FROM catalog_element WHERE id=$1) ORDER BY id FOR SHARE`, [elementId]);
      const selected = selectPatternRule(rows.map(hydrate),element);
      if (!selected.ok) {
        const ids = selected.error.details?.ruleIds;
        const tied = Array.isArray(ids) ? rows.filter(row=>ids.includes(row.id)).map(row=>row.id) : [];
        await finish(tied,selected.error.message); return;
      }
      const rule = selected.value;
      if (!rule) { await finish(); return; }
      const valid = validateRuleTreatment(rule,element);
      if (!valid.ok) { await finish([rule.id],valid.error.message); return; }
      await tx.query(`INSERT INTO entitlement(pool_id,element_id,project_id,treatment,source_kind,source_ref,mask_kind)
        VALUES($1,$2,$3,$4,'rule',$5,$6) ON CONFLICT(pool_id,element_id) DO NOTHING`, [poolId,elementId,ctx.projectId,rule.treatment,rule.id,rule.maskKind]);
      await finish([rule.id]);
    }).then(()=>{
      if (refusal) console.info({event:'pattern_rule.refused',projectId:ctx.projectId,runId:event.runId,poolId,elementId,...refusal});
    });
  }
}

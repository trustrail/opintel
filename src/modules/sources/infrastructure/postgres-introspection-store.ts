import { notify, type ProjectEvents } from '../../../platform/sse/port.js';
import { withTenant, type Tx } from '../../../platform/db/scope.js';
import { CatalogObject, CatalogElement, CatalogNaming, AsciiTransliterator, reconcileSnapshot, type CatalogObjectState, type ElementState } from '../../catalog/index.js';
import { DomainError, err, ok, Timestamp, type ErrorCode, type IdFactory, type RunId, type SourceId, type Result } from '../../../shared/kernel/index.js';
import type { IntrospectionContext, IntrospectionRun, IntrospectionSource, IntrospectionStore } from '../application/introspection-store.js';
import { transitionRun, enforceTransition, type IntrospectionState } from '../domain/introspection-run.js';
import type { CatalogSnapshot } from '../application/source-connector.js';
import { snapshotResponse } from '../../../shared/sidecar-contract.js';

const runSelect = `SELECT id, source_id AS "sourceId", state, coalesce((progress->>'adoptRenamedNames')::boolean,false) AS "adoptRenamedNames", include_schemas AS include, diff, error, progress->>'errorCode' AS "errorCode",
  to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startedAt",
  to_char(ended_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endedAt" FROM introspection_run`;
const missing = () => err(new DomainError('not_found', 'Introspection run or source was not found.'));
const conflict = () => err(new DomainError('conflict', 'The introspection run is no longer in the expected state.'));
class PublicationRefused { constructor(readonly error: DomainError) {} }

export class PostgresIntrospectionStore implements IntrospectionStore {
  private readonly naming = new CatalogNaming(new AsciiTransliterator());
  constructor(private readonly ids: IdFactory, private readonly events?: ProjectEvents) {}
  private async changed(ctx: IntrospectionContext, work: Promise<Result<IntrospectionRun>>): Promise<Result<IntrospectionRun>> {
    const result = await work; // withTenant has committed before publication.
    if (!result.ok) return result;
    const run = result.value;
    if (run.state === 'complete' || run.state === 'failed' || run.state === 'cancelled') {
      await notify(this.events, ctx.projectId, { type: 'introspection.finished', runId: run.id, sourceId: run.sourceId, state: run.state });
      await notify(this.events, ctx.projectId, { type: 'source.changed', sourceId: run.sourceId });
      if (run.state === 'complete') await notify(this.events, ctx.projectId, { type: 'catalog.changed', sourceId: run.sourceId });
    } else await notify(this.events, ctx.projectId, { type: 'introspection.progress', runId: run.id, sourceId: run.sourceId, state: run.state, objects: 0, total: null });
    return result;
  }
  private async readTx(tx: Tx, id: RunId, lock = false): Promise<Result<IntrospectionRun>> {
    const [row] = await tx.query<IntrospectionRun>(`${runSelect} WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [id]);
    return row === undefined ? missing() : ok(row);
  }
  read(ctx: IntrospectionContext, id: RunId) { return withTenant(ctx, (tx) => this.readTx(tx, id)); }
  source(ctx: IntrospectionContext, id: SourceId) {
    return withTenant(ctx, async (tx): Promise<Result<IntrospectionSource>> => {
      const [row] = await tx.query<IntrospectionSource>('SELECT id, project_id AS "projectId", kind, credential_ref AS "credentialRef", status, receives_landings AS "receivesLandings", landing_strategy AS "landingStrategy" FROM data_source WHERE id=$1', [id]);
      return row === undefined ? missing() : ok(row);
    });
  }
  enqueue(ctx: IntrospectionContext, sourceId: SourceId, include: string[], adoptRenamedNames = false) {
    return this.changed(ctx, withTenant(ctx, async (tx): Promise<Result<IntrospectionRun>> => {
      const [source] = await tx.query<{ status: string }>('SELECT status FROM data_source WHERE id=$1 FOR UPDATE', [sourceId]);
      if (source === undefined) return missing();
      if (source.status === 'archived') return err(new DomainError('conflict', 'An archived source cannot be introspected.'));
      const active = await tx.query('SELECT id FROM introspection_run WHERE source_id=$1 AND state IN (\'queued\',\'connecting\',\'reading\',\'diffing\')', [sourceId]);
      if (active.length > 0) return err(new DomainError('conflict', 'This source already has an active introspection run.'));
      const id = this.ids.create<RunId>();
      await tx.query('INSERT INTO introspection_run (id,source_id,project_id,include_schemas,progress) VALUES ($1,$2,$3,$4,$5::jsonb)', [id,sourceId,ctx.projectId,include,JSON.stringify({phase:'queued',adoptRenamedNames})]);
      return this.readTx(tx,id);
    }));
  }
  advance(ctx: IntrospectionContext, id: RunId, from: IntrospectionState, to: IntrospectionState) {
    enforceTransition(from,to,process.env.NODE_ENV === 'production',(before,after) => console.info({event:'introspection.invalid_transition',from:before,to:after}));
    const legal = transitionRun(from,to);
    if (!legal.ok) return Promise.resolve(legal);
    return this.changed(ctx, withTenant(ctx, async (tx): Promise<Result<IntrospectionRun>> => {
      const current = await this.readTx(tx,id,true);
      if (!current.ok) return current;
      if (current.value.state !== from) return conflict();
      await tx.query(`UPDATE introspection_run SET state=$2, started_at=CASE WHEN $2='connecting' THEN now() ELSE started_at END,
        progress=progress || jsonb_build_object('phase',$2::text) WHERE id=$1`, [id,to]);
      return this.readTx(tx,id);
    }));
  }
  cancel(ctx: IntrospectionContext,id: RunId,requireCancellable = false) {
    return this.changed(ctx, withTenant(ctx,async (tx): Promise<Result<IntrospectionRun>> => {
      const current = await this.readTx(tx,id,true);
      if (!current.ok) return current;
      // Worker cleanup can acknowledge cancellation already persisted by the console.
      if (!requireCancellable && current.value.state === 'cancelled') return current;
      if (!transitionRun(current.value.state,'cancelled').ok) return err(new DomainError('conflict',`Cannot cancel an introspection run in state ${current.value.state}.`));
      await tx.query("UPDATE introspection_run SET state='cancelled', ended_at=now(), progress=progress || jsonb_build_object('phase','cancelled') WHERE id=$1",[id]);
      return this.readTx(tx,id);
    }));
  }
  fail(ctx: IntrospectionContext,id: RunId,reason: string,unreachable: boolean,code: ErrorCode = 'dependency_unavailable') {
    return this.changed(ctx, withTenant(ctx,async (tx): Promise<Result<IntrospectionRun>> => {
      const current = await this.readTx(tx,id,true);
      if (!current.ok) return current;
      if (current.value.state === 'cancelled') return current;
      if (!transitionRun(current.value.state,'failed').ok) return conflict();
      await tx.query("UPDATE introspection_run SET state='failed',error=$2,ended_at=now(),progress=progress || jsonb_build_object('phase','failed','errorCode',$3::text) WHERE id=$1",[id,reason,code]);
      if (unreachable) await tx.query("UPDATE data_source SET status='unreachable' WHERE id=$1 AND status<>'archived'",[current.value.sourceId]);
      return this.readTx(tx,id);
    }));
  }
  async publish(ctx: IntrospectionContext,id: RunId,snapshot: CatalogSnapshot): Promise<Result<IntrospectionRun>> {
    const parsed = snapshotResponse.safeParse({snapshot});
    if (!parsed.success) return err(new DomainError('validation_failed','Invalid catalogue snapshot.'));
    try { return await this.changed(ctx, withTenant(ctx,async (tx): Promise<Result<IntrospectionRun>> => {
      const current = await this.readTx(tx,id,true);
      if (!current.ok) return current;
      if (current.value.state !== 'diffing') return conflict();
      const [source] = await tx.query<IntrospectionSource>('SELECT id,project_id AS "projectId",status FROM data_source WHERE id=$1 FOR UPDATE',[current.value.sourceId]);
      if (source === undefined || source.status === 'archived') return conflict();
      const states = await tx.query<CatalogObjectState>(`SELECT id,source_id AS "sourceId",project_id AS "projectId",schema_name AS "schemaName",
        object_name AS "objectName",object_kind AS kind,duckdb_schema AS "duckdbSchema",duckdb_name AS "duckdbName",name_revision AS "nameRevision",
        lineage_known AS "lineageKnown",row_estimate::float8 AS "rowEstimate",description,status FROM catalog_object WHERE source_id=$1
        AND (CASE WHEN cardinality($2::text[])=0 THEN schema_name <> 'information_schema' AND left(schema_name,3) <> 'pg_' ELSE schema_name=ANY($2::text[]) END) FOR UPDATE`,[source.id,current.value.include]);
      const previous: CatalogObject[] = [];
      for (const state of states) {
        const elements = await tx.query<Omit<ElementState, 'discoveredAt' | 'removedAt'> & { discoveredAt: Date; removedAt: Date | null }>(`SELECT id,object_id AS "objectId",project_id AS "projectId",
          source_identifier AS "sourceIdentifier",stable_ref AS "stableRef",source_type AS "sourceType",duckdb_type AS "duckdbType",
          duckdb_name AS "duckdbName",name_revision AS "nameRevision",nullable,is_key AS "isKey",description,status,
          discovered_at AS "discoveredAt",removed_at AS "removedAt" FROM catalog_element WHERE object_id=$1 FOR UPDATE`,[state.id]);
        const aggregate = CatalogObject.create(state,elements.map((element) => new CatalogElement({...element,discoveredAt:Timestamp(element.discoveredAt),removedAt:element.removedAt===null?null:Timestamp(element.removedAt)})));
        if (!aggregate.ok) throw new PublicationRefused(aggregate.error);
        previous.push(aggregate.value);
      }
      // An explicit subset cannot remove objects in schemas it did not request.
      if (current.value.include.length > 0 && parsed.data.snapshot.objects.some((object) => !current.value.include.includes(object.schema))) {
        return err(new DomainError('validation_failed','Snapshot contains a schema outside the requested selection.'));
      }
      const staged = reconcileSnapshot(previous,parsed.data.snapshot,source,this.naming,this.ids,current.value.adoptRenamedNames);
      if (!staged.ok) throw new PublicationRefused(staged.error);
      // The durable invalidation instruction precedes metadata publication.
      // Item 4.1 will delete entitlements in this transaction after this write.
      await tx.query('UPDATE introspection_run SET diff=$2::jsonb WHERE id=$1',[id,JSON.stringify(staged.value.diff)]);
      for (const object of staged.value.objects) {
        const s = object.state;
        await tx.query(`INSERT INTO catalog_object(id,source_id,project_id,schema_name,object_name,object_kind,duckdb_schema,duckdb_name,name_revision,lineage_known,row_estimate,description,status)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT(id) DO UPDATE SET
          object_kind=EXCLUDED.object_kind,row_estimate=EXCLUDED.row_estimate,status=EXCLUDED.status`,
          [s.id,s.sourceId,s.projectId,s.schemaName,s.objectName,s.kind,s.duckdbSchema,s.duckdbName,s.nameRevision??0,s.lineageKnown,s.rowEstimate,s.description,s.status]);
        // Stable-reference renames can exchange two source names. Vacate those
        // names inside this transaction before applying the final snapshot;
        // intermediate identifiers are never visible to catalogue readers.
        const prior = previous.find((entry) => entry.state.id === s.id);
        const reserved = new Set([...object.elements, ...(prior?.elements ?? [])].map((entry) => entry.state.sourceIdentifier));
        for (const {state: element} of object.elements) {
          const old = prior?.elements.find((entry) => entry.state.id === element.id);
          if (old === undefined || old.state.sourceIdentifier === element.sourceIdentifier) continue;
          let temporary = `__introspection_${id}_${element.id}`;
          while (reserved.has(temporary)) temporary += '_';
          reserved.add(temporary);
          await tx.query('UPDATE catalog_element SET source_identifier=$2 WHERE id=$1',[element.id,temporary]);
        }
        for (const {state:e} of object.elements) {
          await tx.query(`INSERT INTO catalog_element(id,object_id,project_id,source_identifier,stable_ref,source_type,duckdb_type,duckdb_name,name_revision,nullable,is_key,description,status,discovered_at,removed_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) ON CONFLICT(id) DO UPDATE SET
            duckdb_name=EXCLUDED.duckdb_name,name_revision=EXCLUDED.name_revision,source_identifier=EXCLUDED.source_identifier,stable_ref=EXCLUDED.stable_ref,source_type=EXCLUDED.source_type,duckdb_type=EXCLUDED.duckdb_type,
            nullable=EXCLUDED.nullable,is_key=EXCLUDED.is_key,description=EXCLUDED.description,status=EXCLUDED.status,removed_at=EXCLUDED.removed_at`,
            [e.id,e.objectId,e.projectId,e.sourceIdentifier,e.stableRef,e.sourceType,e.duckdbType,e.duckdbName,e.nameRevision??0,e.nullable,e.isKey,e.description,e.status,e.discoveredAt,e.removedAt]);
        }
      }
      await tx.query("UPDATE introspection_run SET state='complete',ended_at=now(),progress=progress || jsonb_build_object('phase','complete','objects',$2::int) WHERE id=$1",[id,staged.value.objects.length]);
      await tx.query("UPDATE data_source SET status='connected',last_introspected_at=now() WHERE id=$1",[source.id]);
      return this.readTx(tx,id);
    })); } catch(error: unknown) {
      if (error instanceof PublicationRefused) return err(error.error);
      throw error;
    }
  }
}

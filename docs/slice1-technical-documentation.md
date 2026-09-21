# Opintel Slice 1 (Pilot): Technical Documentation

**Slice 1a plus 1b. Everything needed to pass the pilot success criteria and nothing else.**

Sequencing, gates and work items are in `implementation-plan.md`. This document carries no schedule; the plan explains why.
Version 1.1

This document establishes the conventions for all three slices. Slices 2 and 3 are written as deltas against it. Where they are silent, this document governs.

**In scope:** foundation and auth, companies and projects, two source connectors, per-field entitlements, pools and the agent interface, evidence records, natural language querying without the compounding layer, and the query sidecar in customer-network mode.

**Explicitly out:** fragments, protocols, fast lane, learning loops, source of truth registry, relationships, knowledge, the **observations register** as a workflow surface, key-policy release, SAML, SCIM.

**The Dashboard screen is in.** Findings surface in its needs-a-decision feed. What Slice 3 adds is the register behind them, with acknowledge and resolve states and a history.

---

# 1. Domain model

## 1.1 Bounded contexts

Ten contexts in Slice 1. Each is a folder under `src/modules/`, each owns its tables, and cross-context access goes through a published interface, never a direct table read.

| Context | Owns | Publishes |
|---|---|---|
| `identity` | Users, sessions, magic links, federated identities | `CurrentUser`, `SessionPort` |
| `tenancy` | Companies, projects, members, invitations | `ProjectRef`, `MembershipQuery` |
| `authz` | The SpiceDB graph and its cache | `AuthorizationPort` |
| `sources` | Data source registration, credentials, introspection runs | `SourceRef`, `SourceConnector` |
| `catalog` | Schemas, objects, elements, statistics, namespace mapping | `ElementRef`, `CatalogQuery` |
| `entitlements` | The per-pool, per-element decision and view compilation | `EntitlementQuery`, `ViewDefinition` |
| `pools` | Pools, keys, source bindings, agent presence | `PoolRef`, `KeyVerifier` |
| `vocabulary` | Industries, inherited terms, project overrides, embeddings | `EffectiveVocabulary`, `RetrievalPort` |
| `querying` | Classification, resolution, composition, quality control | `PipelinePort` |
| `evidence` | Run records, stages, export | `RecordWriter`, `EvidenceQuery` |

**Rule.** A context may import another context's published types. It may not import another context's `domain/` or `infrastructure/`. Enforced by an ESLint boundary rule and a dependency-cruiser check in CI.

## 1.2 Aggregates and their invariants

An aggregate is the unit of consistency. One transaction touches one aggregate root.

### Project (root: `Project`)

```ts
class Project {
  readonly id: ProjectId;
  readonly companyId: CompanyId;
  readonly industryId: IndustryId;   // immutable except by migration
  readonly region: Region;           // immutable, always
  name: ProjectName;
  settings: ProjectSettings;
}
```

**Invariants**
- `name` unique within `companyId`, case-insensitive
- `region` never changes after creation. There is no setter and no route
- `industryId` changes only through `MigrateIndustry`, which is a distinct command requiring both project and company administration. It is a migration because it changes which terms are inherited and must not touch entitlements. **In Slice 3 it also orphans protocols and fragments keyed to the old vocabulary**, which are deactivated rather than deleted; neither exists in Slice 1
- `companyId` is fixed once any agent has authenticated against the project

### Industry (root: `Industry`) and its vocabulary

**Platform scope, not tenant scope.** This is the only aggregate in the system that is shared across every customer, and the only one a customer cannot write to.

```ts
class Industry {
  readonly id: IndustryId;
  readonly slug: IndustrySlug;         // 'reinsurance-treaty', 'real-estate-finance'
  name: string;
  description: string;
  active: boolean;
  vocabularyVersion: number;           // bumped on any publish
  demoPackVersion: number;
}

class DemoSourceTemplate {
  readonly id: DemoSourceId;
  readonly industryId: IndustryId;
  name: string;                        // 'Bordereaux Store'
  kind: DemoTemplateKind;              // how the demo is produced, not what
                                       // the resulting source is. Both end up
                                       // as a data_source of kind 'demo'.
  schemaSpec: SchemaSpec;              // objects, elements, types, keys
  generatorSpec: GeneratorSpec;        // seed, row counts, distributions, join keys
  narrative: string;                   // what this source is for, shown when connecting
}

class VocabularyTerm {
  readonly id: TermId;
  readonly scope: 'industry' | 'project';
  readonly industryId: IndustryId | null;   // set when scope is industry
  readonly projectId: ProjectId | null;     // set when scope is project
  readonly kind: 'metric' | 'subject' | 'operation' | 'parameter';
  name: TermName;                       // canonical, unique within its scope and kind
  displayName: string;
  synonyms: string[];
  active: boolean;
  // metric only
  formula?: string;
  requiredColumns?: string[];
  assumptionColumns?: string[];
  grainRule?: GrainRule;                // required for measures and ratios
  // parameter only
  paramType?: 'string' | 'enum' | 'integer' | 'date' | 'boolean';
  enumValues?: string[];
  columnHint?: string;                  // drives value resolution
  // subject only
  aliases?: string[];
  // operation only
  resultShape?: 'scalar' | 'row' | 'series' | 'comparison';
}
```

**Invariants**

- `scope` determines which of `industryId` and `projectId` is set. Exactly one, enforced by a check constraint
- A project term with the same `kind` and `name` as an industry term **overrides** it. Both rows continue to exist; the merge decides which wins
- A metric whose `formula` aggregates requires a `grainRule`. Composition refuses without one, because `SUM(a)/SUM(b)` and `AVG(a/b)` are different numbers and which is correct is a business decision
- Only a platform administrator writes industry-scope terms. There is no customer-facing route that does

**Four kinds, not one entity.** A metric carries a formula, required columns and a grain rule. A parameter carries a type, enumerated values and a column hint. Collapsing them into one `term` entity would produce a lowest common denominator that helps nobody.

### Demo sources, and why there is no sandbox mode

**There is no sandbox project, no sandbox mode, and no flag on `Project`.** Every project is real.

An industry ships a **demo pack** alongside its vocabulary: a set of source templates with realistic schemas, generated data, and cross-source join keys that actually join. A person connects one through the same flow as a customer database. It is tested, introspected, catalogued, entitled, queried and recorded by **the same code**, with no branch anywhere that asks whether a source is real.

What this buys:

- **Onboarding and evaluation with no database access.** Create a project, connect the demo source for your industry, and the product works end to end on the first day
- **A demo source and a customer source side by side in one project**, which is what someone evaluating actually wants and which a boolean forbade
- **No destructive mode transition.** Leaving the demo behind is deleting a source, an ordinary operation with the confirmation we already have
- **The demo exercises the real introspection path**, so a bug in it is a bug in the product rather than in a special case

**Synthetic is a property of data, derived at write time.** A run is marked synthetic when any source it touched was a demo source, computed from what it actually reached, not from a flag that could disagree with reality. Synthetic runs are excluded from evidence exports and from metering.

**The demo pack is versioned with the industry**, so improving it improves evaluation for every future project in that vertical, exactly as vocabulary does.

**An industry pack therefore has three parts:** the vocabulary, the demo sources, and the discovery question set (§11.2). Slice 3 adds a fourth, fragments and protocols.

### EffectiveVocabulary (a read model, not an aggregate)

```ts
type EffectiveVocabulary = {
  projectId: ProjectId;
  version: number;                      // industryVersion + projectRevision
  terms: Array<VocabularyTerm & { source: 'inherited' | 'project' }>;
};
```

**The merge happens server side, once.** Screens and the classifier both consume the merged result with a `source` field per term. If the client merged, four screens would implement four slightly different merge rules.

**Inheritance is by reference, never by copy.** A project reads its industry's terms through this read model. Republishing an industry pack improves every project in that vertical with no migration. Copying at creation would freeze each project at the pack version of the day it was made, which is the difference between a compounding asset and two hundred divergent snapshots.

### DataSource (root: `DataSource`)

```ts
class DataSource {
  readonly id: SourceId;
  readonly projectId: ProjectId;
  readonly kind: SourceKind;         // postgres | demo
  readonly origin: 'customer' | 'demo';
  readonly demoTemplateId: DemoSourceId | null;   // set when origin is demo
  name: SourceName;
  credentialRef: VaultRef;           // required for every source, including demo
  samplingConsent: boolean;
  status: SourceStatus;
  freshness: Freshness;
}
```

**Invariants**
- `credentialRef` is a non-null vault reference for every origin. A literal secret fails construction
- `origin` is immutable. A demo source never becomes a customer source, and the reverse is meaningless
- Deleting a source requires that its dependent entitlements be enumerated to the caller first
- `samplingConsent` defaults false and can only be set by an explicit command with an audit entry

### CatalogElement (root: `CatalogObject`, elements are entities within it)

```ts
class CatalogElement {
  readonly id: ElementId;
  readonly objectId: ObjectId;
  readonly sourceIdentifier: string;   // as the source names it
  readonly duckdbName: string | null;  // assigned once; null means unnameable
  nameRevision: number;               // incremented only by explicit adoption
  readonly stableRef: string | null;   // attnum, field id, if the source has one
  type: SourceType;
  duckdbType: DuckDbType | null;       // null means unsupported type
  status: 'active' | 'removed';
}
```

**Invariants**
- `duckdbName` is assigned at first discovery and is immutable. Recomputing it would rename tables under running agents
- Two elements in one object cannot share a `duckdbName`. Collisions get a numeric suffix and raise a catalog diff entry
- An element marked `removed` keeps its entitlements for evidence reproducibility

### Entitlement (root: `Entitlement`, keyed by pool and element)

```ts
type Treatment = 'clear' | 'tokenized' | 'masked' | 'aggregate_only' | 'withheld';
// 'reference' is Slice 3

class Entitlement {
  readonly poolId: PoolId;
  readonly elementId: ElementId;
  treatment: Treatment;
  readonly setBy: ActorRef;          // user or rule
  readonly setAt: Timestamp;
}
```

**Invariants**
- There is no `undecided` treatment. Undecided is the **absence** of an entitlement row. This is the single most important modelling decision in the system: it makes "not decided" unrepresentable as a granted state
- An entitlement cannot be deleted back to undecided through the API. The only transition out of undecided is a decision
- Setting a bulk selection to `clear` requires a non-empty justification, carried on the command

**A type-family change deletes the entitlement row**. That is the only deletion the model permits, and it is how an element returns to undecided. The decision was made about a number; the column is now text, and carrying the treatment across would be honouring a decision nobody made.

**The deletion is recorded before it happens**. The introspection diff names the element, the old treatment, the old and new type families, and the run that caused it. The row is gone; the fact that it existed and why it went is not.


### Pool (root: `Pool`)

```ts
class Pool {
  readonly id: PoolId;
  readonly projectId: ProjectId;
  name: PoolName;
  boundSources: SourceId[];
  modes: { query: boolean; prompt: boolean };
  clarificationPolicy: 'pause' | 'refuse';   // unattended callers set refuse
  budgets: PoolBudgets;
  keys: PoolKey[];                   // at most two: current and retiring
}
```

**Invariants**
- At most one key is `current`. A rotation creates a second in `retiring` with a grace expiry
- A pool with no bound sources can exist. It resolves to an empty namespace, which is correct and not an error
- **Agents are not members of this aggregate.** The key is the membership. `agentId` is observational and appears only in presence and evidence

### QueryRun (root: `QueryRun`, append-only)

```ts
class QueryRun {
  readonly id: RunId;
  readonly poolId: PoolId;
  readonly agentId: string | null;   // self-declared, observational
  readonly mode: 'query' | 'prompt';
  readonly request: string;
  readonly stages: RunStage[];
  readonly elements: ElementDelivery[];
  readonly versions: VersionStamp;
  readonly outcome: RunOutcome;
}
```

**Invariants**
- Immutable after `outcome` is set. No setters exist on the class
- Every stage that ran appends a `RunStage`. A refusal records the stage that refused and why
- `versions` is captured at request start, not at completion, so a mid-flight configuration change is visible as a discrepancy rather than hidden

## 1.3 Value objects

Always constructed through a factory that validates. Never a bare string. **This is the complete inventory**, so nothing elsewhere in this document uses a branded name that is not here.

```ts
// Branded UUIDs. Every one is validated on construction.
type CompanyId    = string & { readonly __brand: 'CompanyId' };
type ProjectId    = string & { readonly __brand: 'ProjectId' };
type UserId       = string & { readonly __brand: 'UserId' };
type SourceId     = string & { readonly __brand: 'SourceId' };
type ObjectId     = string & { readonly __brand: 'ObjectId' };
type ElementId    = string & { readonly __brand: 'ElementId' };
type PoolId       = string & { readonly __brand: 'PoolId' };
type RunId        = string & { readonly __brand: 'RunId' };
type IndustryId   = string & { readonly __brand: 'IndustryId' };
type TermId       = string & { readonly __brand: 'TermId' };
type RuleId       = string & { readonly __brand: 'RuleId' };
type DemoSourceId = string & { readonly __brand: 'DemoSourceId' };
type FilingId     = string & { readonly __brand: 'FilingId' };
type SessionId   = string & { readonly __brand: 'SessionId' };

// Branded strings with a shape rule, validated on construction.
type DuckDbName    = string & { readonly __brand: 'DuckDbName' };
  // lowercase snake case, not a DuckDB reserved word, 63 characters or fewer
type IndustrySlug  = string & { readonly __brand: 'IndustrySlug' };
  // lowercase kebab case, for example 'reinsurance-treaty'
type PoolKey       = string & { readonly __brand: 'PoolKey' };
  // opk_live_ plus 22 base62 characters. Held as a SHA-256 hash after creation
  // and never returned by any route
type ProjectName   = string & { readonly __brand: 'ProjectName' };  // 1 to 80 chars, unique per company
type PoolName      = string & { readonly __brand: 'PoolName' };     // 1 to 80 chars, unique per project
type SourceName    = string & { readonly __brand: 'SourceName' };   // 1 to 80 chars, unique per project
type TermName      = string & { readonly __brand: 'TermName' };     // lowercase, unique per scope and kind
type InviteId     = string & { readonly __brand: 'InviteId' };
type InviteId     = string & { readonly __brand: 'InviteId' };
type InviteId     = string & { readonly __brand: 'InviteId' };
type InviteId     = string & { readonly __brand: 'InviteId' };

// Closed unions.
type Region    = 'eu-west-1' | 'us-east-1' | 'ap-southeast-1' | 'ap-southeast-3';
type GrainRule = 'sum' | 'sum_over_sum' | 'avg_of_ratio' | 'none';
```

**Every branded type has a factory with the same name**, which validates and throws `InvariantViolation` on a bad value:

```ts
export const ProjectId = (raw: string): ProjectId => {
  if (!UUID_RE.test(raw)) throw new InvariantViolation('ProjectId', raw);
  return raw as ProjectId;
};

export const DuckDbName = (raw: string): DuckDbName => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(raw) || RESERVED.has(raw)) {
    throw new InvariantViolation('DuckDbName', raw);
  }
  return raw as DuckDbName;
};
```

A function taking `(projectId: ProjectId, poolId: PoolId)` cannot be called with the arguments swapped. That eliminates an entire class of bug otherwise found only in production, and it costs one line per type.

**Construction throws rather than returning a `Result`.** A malformed id is a programming error, not a domain outcome, and it should not travel through a use case's error path pretending to be one. Input from the wire is validated by Zod at the boundary before any factory sees it.

## 1.4 Domain events

Published in-process after the transaction commits, via an outbox. Handlers are idempotent and keyed on the event id.

| Event | Raised by | Consumed by |
|---|---|---|
| `ProjectCreated` | tenancy | evidence (audit), catalog (seed) |
| `MemberGranted` / `MemberRevoked` | tenancy | authz (write tuple), evidence |
| `SourceConnected` | sources | catalog (queue introspection) |
| `IntrospectionCompleted` | sources | catalog (apply diff), entitlements (apply pattern rules) |
| `ElementsDiscovered` | catalog | entitlements (rules), evidence |
| `EntitlementChanged` | entitlements | pools (recompile view), evidence (audit) |
| `PoolKeyRotated` | pools | evidence (audit) |
| `AgentPresenceChanged` | pools | (stream only) |
| `IndustryPackPublished` | vocabulary (platform) | vocabulary (invalidate effective, re-embed), sources (new demo templates available) |
| `TermChanged` | vocabulary | vocabulary (re-embed), evidence (audit) |
| `QueryExecuted` | evidence | (Slice 3: knowledge) |

**Rule.** An event never carries a domain object. It carries identifiers and a minimal payload. Handlers re-read what they need.

## 1.5 State machines

Explicit transition tables. An illegal transition throws in development and is logged and dropped in production.

**Introspection run**

```
queued -> connecting -> reading -> diffing -> complete
                 |          |         |
                 +----------+---------+---> failed
any -> cancelled  (from queued, connecting, reading only)
```

**Agent presence**

```
connecting -> active <-> idle -> stale -> disconnected
```

`idle` after 60s without a request, `stale` after 3 missed heartbeats, `disconnected` after the grace window. **A disconnected agent is never removed from the list.** Absence is information.

**Pool key**

```
current -> retiring -> expired
current -> revoked          (break glass, requires typed confirmation)
```

## 1.6 What is deliberately not modelled in Slice 1

- Agent as a graph subject. The key is the membership
- `undecided` as a treatment value
- Fragments, protocols, vocabulary versions beyond a single counter
- Releases and **release** key custody, meaning the by-reference treatment and its policy-bound key release. The **tokenization** key is a different thing and is in Slice 1: see §4.3a in the plan and algorithm specifications A.5.1
- Observations as a workflow entity. Slice 1 surfaces findings inline, not as a register

## 1.7 Types used throughout

Referenced across this document and previously left undefined. All live in `shared/kernel` or their owning module's `domain`.

On project creation: project#company@company and project#admin@user for the creating user. Nothing else.

```ts
// shared/kernel
type JsonValue  = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue };
type JsonObject = { [k: string]: JsonValue };

companiesAdministeredBy(user: UserId): Promise<CompanyId[]>;

type ActorRef =
  | { kind: 'user';   id: UserId }
  | { kind: 'rule';   id: RuleId }
  | { kind: 'system'; name: string };

type ErrorCode =
  // console
  | 'unauthenticated' | 'forbidden' | 'not_found' | 'validation_failed'
  | 'conflict' | 'idempotency_key_reused' | 'rate_limited' | 'dependency_unavailable'
  // agent facing
  | 'entitlement_missing' | 'element_withheld' | 'object_unavailable'
  | 'term_unresolved' | 'clarification_required' | 'domain_knowledge_gap'
  | 'sources_cannot_be_joined' | 'large_result_confirmation' | 'budget_exceeded'
  | 'source_unavailable' | 'sql_not_permitted' | 'unsupported_pushdown';

// platform/db: the transaction handle a scope hands to its callback.
// It exposes query and nothing else. No commit, no rollback, no release:
// the scope owns the lifecycle.
interface Tx {
  query<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  one<T = unknown>(sql: string, params?: readonly unknown[]): Promise<T>;
  none(sql: string, params?: readonly unknown[]): Promise<void>;
}

// modules/sources/domain
type SourceKind   = 'postgres' | 'demo';

// How a demo template produces its data. Distinct from SourceKind: a template
// of either kind yields a data_source whose kind is 'demo'. A 'spreadsheet'
// template generates files and lands them, exercising the ingest path.
type DemoTemplateKind = 'postgres' | 'spreadsheet';
type SourceOrigin = 'customer' | 'demo';
type SourceStatus = 'pending' | 'testing' | 'connected' | 'unreachable' | 'archived';
type Freshness    =
  | { mode: 'live' }
  | { mode: 'cached'; asOf: Timestamp; maxAgeSeconds: number }
  | { mode: 'generated' };                       // demo sources
type LandingStrategy = 'append_as_at' | 'table_per_filing';

// modules/pools/domain
type PoolBudgets = {
  rowsPerDay: number;
  rowsPerRequest: number;
  timeoutMs: number;
  memoryMb: number;
  concurrency: number;
};

// modules/tenancy/domain
type ProjectSettings = {
  discovery: { schedule: 'off'|'hourly'|'daily'|'weekly';
               newElements: 'hold'|'rules_only';
               typeFamilyChange: 'revert'|'carry';
               renameHandling: 'carry'|'new';
               adoptRenamedNames: boolean;
               valueSampling: boolean; sampleSize: number };
  query:     { timeoutSeconds: number; rowLimit: number;
               dailyRowBudgetPerPool: number;
               cardinalityConfirmThreshold: number;
               aggregateMinGroupSize: number;
               memoryLimitMb: number; concurrencyPerPool: number };
  evidence:  { fullRetentionDays: number; rollupRetentionDays: number;
               redaction: 'aggressive'|'allowlist'|'none';
               allowlistedFields: string[]; captureSamplingPercent: number };
};

// shared/kernel: the one error thrown rather than returned. A broken invariant
// is a bug, not a domain outcome, so it does not travel in a Result.
class InvariantViolation extends Error {
  readonly code = 'invariant_violation' as const;
  constructor(readonly invariant: string, readonly received: unknown) {
    // NOTE: `received` is never rendered into the message, because it may be a
    // customer value. It is available to a debugger and to nothing else.
    super(`Invariant violated: ${invariant}`);
  }
}

// modules/catalog: two type families, kept apart on purpose. A source type is
// whatever the source called it, verbatim, so a diff can detect a change. A
// DuckDB type is what the agent sees, after treatment.
type SourceType = string & { readonly __brand: 'SourceType' };   // 'character varying(40)'
type DuckDbType =
  | 'BOOLEAN' | 'TINYINT' | 'SMALLINT' | 'INTEGER' | 'BIGINT' | 'HUGEINT'
  | 'FLOAT' | 'DOUBLE' | `DECIMAL(${number},${number})`
  | 'VARCHAR' | 'DATE' | 'TIME' | 'TIMESTAMP' | 'TIMESTAMPTZ'
  | 'UUID' | 'JSON' | `LIST(${string})` | `STRUCT(${string})`;

// ---- identity ----
// What a request carries once authenticated. Never the session id itself:
// that stays in the cookie and in Redis, and no handler needs it.
type CurrentUser = {
  id: UserId;
  email: string;                    // verified. The identity, per §3.2
  fullName: string | null;
  timezone: string;
  method: AuthMethod;
  sessionCreatedAt: Timestamp;
  deviceConfirmed: boolean;         // true when a nonce mismatch was resolved
};

type AuthMethod = 'magic_link' | `oidc:${string}`;

interface SessionPort {
  create(user: UserId, meta: SessionMeta, method: AuthMethod, deviceConfirmed: boolean): Promise<SessionId>;
  read(id: SessionId): Promise<SessionRecord | null>;
  touch(id: SessionId): Promise<void>;
  rotate(id: SessionId): Promise<SessionId>;
  revoke(id: SessionId): Promise<void>;
  revokeAllFor(user: UserId, except?: SessionId): Promise<number>;
  listFor(user: UserId): Promise<SessionSummary[]>;
}

// What Redis holds. It is NOT CurrentUser: the session stores identity and
// nothing else, so a profile change does not require rewriting sessions.
type SessionRecord = {
  userId: UserId;
  method: AuthMethod;
  createdAt: Timestamp;          // absolute expiry is measured from here
  lastSeenAt: Timestamp;         // idle expiry is measured from here
  deviceConfirmed: boolean;
  meta: SessionMeta;
};

type SessionSummary = {
  id: SessionId;
  meta: SessionMeta;
  lastSeenAt: Timestamp;
  current: boolean;              // set by the caller, which knows its own id
};

type SessionMeta = {
  ip: string;
  userAgent: string;
  deviceNonce: string;
};

// modules/identity
interface AccountRepository {
  findByEmail(email: string): Promise<UserAccount | null>;
  create(email: string, invite: PendingInvite | null): Promise<UserAccount>;
  recordLogin(id: UserId, at: Timestamp): Promise<void>;
}

interface InviteRepository {
  findPendingFor(email: string): Promise<PendingInvite | null>;
  findInvitationById(id: InviteId): Promise<PendingInvite | null>;
  markAccepted(id: InviteId, by: UserId): Promise<void>;
}

type UserAccount = {
  id: UserId;
  email: string;
  fullName: string | null;
  timezone: string;
  createdAt: Timestamp;
  lastLoginAt: Timestamp | null;
};

type PendingInvite = {
  id: InviteId;
  email: string;
  companyId: CompanyId;
  projectId: ProjectId | null;
  role: 'admin' | 'operator' | 'viewer';
  expiresAt: Timestamp;
};

// ---- pools ----
type PoolRef = {
  id: PoolId;
  projectId: ProjectId;
  name: PoolName;
  modes: { query: boolean; prompt: boolean };
  clarificationPolicy: 'pause' | 'refuse';
};

// Resolves a presented bearer token to a pool. This is the ONLY place a key
// becomes an identity, and it is deliberately narrow: it returns a pool and
// nothing about any agent.
interface KeyVerifier {
  verify(presented: string): Promise<KeyVerdict>;
}
type KeyVerdict =
  | { ok: true;  pool: PoolRef; keyPrefix: string; keyState: 'current' | 'retiring' }
  | { ok: false; reason: 'unknown' | 'revoked' | 'expired' | 'malformed' };
// A failed verdict never says which of the four it was to the caller. The
// distinction is recorded, not returned, because it is an oracle otherwise.

// ---- retrieval ----
interface RetrievalPort {
  search(q: RetrievalQuery): Promise<RetrievalHit[]>;
  upsert(owner: { type: 'metric' | 'term_synonym' | 'prompt'; id: string },
         scope: { industryId?: IndustryId; projectId?: ProjectId },
         content: string): Promise<void>;
  deactivate(owner: { type: string; id: string }): Promise<void>;
}
type RetrievalQuery = {
  text: string;
  ownerType: 'metric' | 'term_synonym' | 'prompt';
  industryId: IndustryId;        // scope filters ALWAYS applied before ranking,
  projectId: ProjectId;          // never after. Asserted in test T-020
  limit: number;
  model: string;                 // one model per search. Never mixed
};
type RetrievalHit = {
  ownerId: string;
  content: string;
  similarity: number;            // cosine, 0 to 1
  scope: 'industry' | 'project';
};

// ---- querying ----
interface PipelinePort {
  run(req: PipelineRequest): AsyncIterable<PipelineEvent>;
  resume(runId: RunId, answers: ClarificationAnswer[]): AsyncIterable<PipelineEvent>;
  dryRun(req: PipelineRequest): Promise<{ plan: JsonObject; wouldRefuse: ErrorCode | null }>;
}
type PipelineRequest = {
  pool: PoolRef;
  mode: 'query' | 'prompt';
  text: string;
  agentId: string | null;        // observational only. Nothing authorises on it
};
type PipelineEvent =
  | { kind: 'stage';   stage: RunStage }
  | { kind: 'clarify'; items: ClarificationItem[] }
  | { kind: 'rows';    rows: JsonObject[]; truncated: boolean }
  | { kind: 'done';    outcome: RunOutcome; runId: RunId };
type ClarificationItem = {
  concept: string;
  kind: 'parameter_value' | 'metric' | 'source' | 'join_path';
  candidates: Array<{ value: string; frequency?: number; via: 'mapping' | 'similarity' | 'frequency'; spokenAs?: string }>;
  saveAsDefaultAvailable: boolean;
};
type ClarificationAnswer = { concept: string; value: string | null; saveAsDefault: boolean };

// ---- evidence ----
interface RecordWriter {
  // Opening a record is the FIRST thing a request does, so a crash mid-flight
  // leaves a record with no outcome rather than no record at all.
  open(req: { pool: PoolRef; mode: 'query' | 'prompt'; text: string;
              agentId: string | null; versions: VersionStamp }): Promise<RunId>;
  stage(run: RunId, stage: RunStage): Promise<void>;
  elements(run: RunId, delivered: ElementDelivery[]): Promise<void>;
  close(run: RunId, outcome: RunOutcome): Promise<void>;
}

interface EvidenceQuery {
  run(id: RunId): Promise<QueryRun | null>;
  list(project: ProjectId, filter: RunFilter, cursor?: string):
    Promise<{ items: QueryRun[]; nextCursor: string | null }>;
  countsByOutcome(project: ProjectId, since: Timestamp): Promise<Record<RunOutcome['kind'], number>>;
  export(project: ProjectId, filter: RunFilter, format: 'ndjson' | 'csv'): AsyncIterable<string>;
}
type RunFilter = {
  pool?: PoolId;
  mode?: 'query' | 'prompt';
  outcome?: RunOutcome['kind'];
  element?: ElementId;
  from?: Timestamp;
  to?: Timestamp;
  includeSynthetic?: boolean;     // default false. Exports exclude them
};

// ---- published interfaces, one per bounded context ----
// These are the ONLY things a module exposes. A caller that needs more is
// either in the wrong module or the boundary is drawn in the wrong place.

// tenancy
type ProjectRef = {
  id: ProjectId;
  companyId: CompanyId;
  industryId: IndustryId;
  region: Region;
  name: string;
};
interface MembershipQuery {
  rolesFor(user: UserId, project: ProjectId): Promise<ProjectRole[]>;
  membersOf(project: ProjectId): Promise<Array<{ user: UserId; role: ProjectRole; via: 'project' | 'company' }>>;
  projectsFor(user: UserId): Promise<ProjectRef[]>;
}
type ProjectRole = 'admin' | 'operator' | 'viewer';

// authz
interface AuthorizationPort {
  check(req: CheckRequest): Promise<CheckResult>;
  checkMany(reqs: CheckRequest[], options?: { withTracing: boolean }): Promise<CheckResult[]>;
  write(updates: RelationshipUpdate[]): Promise<ZedToken>;
  explain(req: CheckRequest): Promise<{ allowed: boolean; path: string[] }>;
}
type CheckRequest = {
  resource: { type: 'company' | 'project' | 'pool' | 'datasource'; id: string };
  permission: string;
  subject: { type: 'user' | 'pool'; id: string };
};
type CheckResult = {
  allowed: boolean;
  checkedAt: Timestamp;
  token: ZedToken;         // stamped on the evidence record
  snapshotAgeMs: number;   // beyond the staleness ceiling, the caller refuses
  explanation?: { path: string[] }; // requested with withTracing
};
type ZedToken = string & { readonly __brand: 'ZedToken' };
type RelationshipUpdate = {
  operation: 'touch' | 'delete';
  resource: CheckRequest['resource'];
  relation: string;
  subject:
    | { type: 'user';    id: UserId }
    | { type: 'pool';    id: PoolId }
    | { type: 'company'; id: CompanyId }; 
};

// catalog
type ElementRef = {
  id: ElementId;
  objectId: ObjectId;
  projectId: ProjectId;
  duckdbName: DuckDbName;
  duckdbType: DuckDbType;
};
interface CatalogQuery {
  element(id: ElementId): Promise<ElementRef | null>;
  elementsOf(object: ObjectId): Promise<ElementRef[]>;
  byPrefix(project: ProjectId, prefix: string, cursor?: string):
    Promise<{ items: ElementRef[]; nextCursor: string | null }>;
  undecidedCount(project: ProjectId): Promise<number>;
  resolve(project: ProjectId, duckdbName: DuckDbName): Promise<ElementRef | null>;
}

// entitlements
interface EntitlementQuery {
  forPool(pool: PoolId): Promise<Map<ElementId, Treatment>>;
  forElement(pool: PoolId, element: ElementId): Promise<Treatment | null>;  // null IS undecided
  clearRatio(pool: PoolId): Promise<number>;
  countsByTreatment(project: ProjectId): Promise<Record<Treatment | 'undecided', number>>;
}

// ---- evidence ----
type VersionStamp = {
  policy: number;       // project.policy_version at request start
  vocabulary: number;   // effective vocabulary version
  catalog: number;      // catalog generation
  tokenKey: number;     // which token key produced the tokens in this response
};

type RunStage = {
  stage: 'classify' | 'recover' | 'resolve_values' | 'resolve_sources'
       | 'compose' | 'validate' | 'qqc_l1' | 'qqc_l2' | 'qqc_l3'
       | 'execute' | 'record';
  result: 'ok' | 'clarify' | 'refuse' | 'warn';
  detail: JsonObject | null;
  ms: number;
};

type ElementDelivery = {
  elementId: ElementId | null;      // null when the agent named something unknown
  duckdbName: DuckDbName;
  treatment: Treatment | null;      // null when it was never entitled
  state: 'released' | 'withheld' | 'undecided' | 'aggregated';
  withheldReason: string | null;
};

type RunOutcome =
  | { kind: 'answered'; rowCount: number; truncated: boolean }
  | { kind: 'reduced';  rowCount: number; truncated: boolean; withheld: number }
  | { kind: 'refused';  code: ErrorCode; element: DuckDbName | null; stage: RunStage['stage'] }
  | { kind: 'clarify';  items: number; resumedAs: RunId | null }
  | { kind: 'failed';   code: ErrorCode; retryable: boolean };

// shared/kernel: time. A branded ISO 8601 string in UTC, so a Timestamp
// cannot be confused with an arbitrary string and arithmetic on it is explicit.
type Timestamp = string & { readonly __brand: 'Timestamp' };
const Timestamp = (d: Date): Timestamp => d.toISOString() as Timestamp;

// platform/vault: a reference, never a secret. Construction validates the
// scheme, which is what makes the "no literal secret" constraint enforceable
// in code as well as in the database.
type VaultRef = string & { readonly __brand: 'VaultRef' };
const VaultRef = (raw: string): VaultRef => {
  if (!raw.startsWith('vault://')) throw new InvariantViolation('VaultRef', raw);
  return raw as VaultRef;
};

// modules/sources: lightweight references passed across module boundaries.
// A Ref carries identity and just enough to name the thing. Anything more
// is re-read by the receiving module.
type SourceRef = {
  id: SourceId;
  projectId: ProjectId;
  kind: SourceKind;
  alias: DuckDbName;              // the catalog name agents address it by
};
type ObjectRef = {
  id: ObjectId;
  sourceId: SourceId;
  schema: string;
  name: string;
};

// modules/catalog: the aggregate that owns elements.
class CatalogObject {
  readonly id: ObjectId;
  readonly sourceId: SourceId;
  readonly projectId: ProjectId;
  readonly schemaName: string;
  readonly objectName: string;
  readonly kind: 'table' | 'view' | 'fileset';
  duckdbSchema: DuckDbName;
  duckdbName: DuckDbName;         // assigned once, never recomputed
  lineageKnown: boolean;          // false for a view with no traceable columns
  rowEstimate: number | null;
  description: string | null;
  status: 'active' | 'removed';
  elements: CatalogElement[];
}

// What a connector returns from introspection. Structure only: no row values
// unless sampling consent was given, and then only through sampleTopValues.
type CatalogSnapshot = {
  takenAt: Timestamp;
  objects: Array<{
    schema: string;
    name: string;
    kind: 'table' | 'view' | 'fileset';
    rowEstimate: number | null;
    columns: Array<{
      sourceIdentifier: string;
      stableRef: string | null;     // attnum or field id, where the source has one
      ordinal: number;              // preserved, so SELECT * matches the source
      sourceType: string;
      nullable: boolean;
      isKey: boolean;
      description: string | null;
    }>;
  }>;
  foreignKeys: Array<{
    fromObject: string; fromColumn: string;
    toObject: string;   toColumn: string;
  }>;
};

// modules/entitlements: what the view compiler emits alongside the DDL.
// This is where undecided and withheld stop being identical: both are absent
// from the SELECT, and describe and the evidence record need to tell them apart.
type CompiledColumn = {
  elementId: ElementId;
  duckdbName: DuckDbName;
  sourceIdentifier: string;
  declaredType: DuckDbType;        // POST-treatment: a tokenized int is VARCHAR
  state: 'emitted' | 'withheld' | 'undecided';
  treatment: Treatment | null;     // null when undecided
  expression: string | null;       // the SELECT expression, when emitted
};

// An aggregate-only constraint cannot live in a view, so it travels beside
// the DDL and is enforced by inspecting the parsed query.
type AggregateOnly = {
  elementId: ElementId;
  duckdbName: DuckDbName;
  object: DuckDbName;
  minGroupSize: number;            // from ProjectSettings.query
};

// shared/kernel: the two ports that make the domain testable.
// Nothing in domain or application reads the wall clock or generates an id
// directly, so a test can make both deterministic.
interface Clock {
  now(): Timestamp;                  // always UTC
}
interface IdFactory {
  create<T extends string>(): T;     // uuid v7, so ids sort by creation time
}

// modules/sources: the one connector interface. The plan and this document
// both call it SourceConnector; ConnectorPort is not a second thing.
interface SourceConnector {
  readonly kind: SourceKind;
  testConnection(ref: VaultRef, signal?: AbortSignal): Promise<Result<void, DomainError>>;
  introspect(ref: VaultRef, include: string[], signal?: AbortSignal): Promise<Result<CatalogSnapshot, DomainError>>;
  sampleTopValues(ref: VaultRef, elements: ElementId[], limit: number, signal?: AbortSignal):
    Promise<Result<Map<ElementId, TopValue[]>, DomainError>>;
  estimateRowCount(ref: VaultRef, object: ObjectRef, signal?: AbortSignal): Promise<Result<number | null, DomainError>>;
}
type TopValue = { value: string; frequency: number };

// modules/sources: what a demo source template declares. Both are data, not
// code: a template is published with an industry pack and never executes.
type SchemaSpec = {
  schemas: Array<{
    name: string;
    objects: Array<{
      name: string;
      kind: 'table' | 'view';
      columns: Array<{
        name: string;
        type: string;              // source-dialect type, mapped per §4.4
        nullable: boolean;
        isKey?: boolean;
        description?: string;
      }>;
    }>;
  }>;
};

type GeneratorSpec = {
  seed: number;                    // fixed, so a demo source is reproducible
  rows: Record<string, number>;    // object name to row count
  joinKeys: Array<{               // keys that must agree across objects,
    objects: string[];            // so cross-source joins actually join
    column: string;
    cardinality: number;
  }>;
  columns?: Record<string, {      // per column, keyed 'object.column'
    distribution?: 'uniform' | 'zipf' | 'normal';
    values?: string[];            // a closed domain, for enumerated columns
    nullRate?: number;
  }>;
  files?: Array<{
    id: string;                    // stable, referenced by dependsOn
    party: string;
    kind: string;
    period: string;
    sheetName: string;
    headerRow: number;
    decimalSeparator: '.' | ',';
    dateFormat: string;
    mergedHeader?: boolean;
    supersedes?: string;           // id of the filing this restates
    dependsOn?: string;            // id that must be durably registered first
  }>;
};

// platform/mail
interface MailPort {
  send(msg: OutboundMail): Promise<Result<MailReceipt, DomainError>>;
}
type OutboundMail = {
  to: string;                        // one recipient. No bulk path exists
  template: 'magic_link' | 'invitation' | 'alert' | 'digest';
  vars: JsonObject;                  // rendered by the adapter, never by the caller
  idempotencyKey: string;            // template plus recipient plus a nonce
};

// A template declares which vars are secret-bearing. Those are stored as a
// reference and resolved by the adapter at dispatch, never persisted.
type MailVarResolution = {
  template: 'magic_link';
  resolve: (vars: JsonObject) => Promise<JsonObject>;
};

type MailReceipt = { providerId: string; acceptedAt: Timestamp };

// Mail is always enqueued to the outbox inside the transaction and dispatched
// after commit. A caller never invokes MailPort directly from a use case.

// shared/api, frontend
type AppError = {
  code: ErrorCode;
  message: string;            // written for a human, rendered unchanged
  details?: JsonObject;
  requestId: string;
  retryable: boolean;
};

// modules/identity
interface MagicLinkRepository {
  issue(email: string, tokenHash: Buffer, deviceNonce: string,
        inviteId: InviteId | null, expiresAt: Timestamp,
        ip: string | null): Promise<void>;
  invalidateOutstanding(email: string): Promise<number>;
  // Atomic: one UPDATE ... WHERE consumed_at IS NULL AND expires_at > now
  //         AND device_nonce = $nonce RETURNING *.
  // Two concurrent callers, exactly one row returned.
  consume(tokenHash: Buffer, deviceNonce: string,
          now: Timestamp): Promise<MagicLinkToken | null>;

  // Consumes without matching the nonce. Used only by /auth/confirm-device,
  // after the person has explicitly said they opened the link themselves.
  consumeConfirmed(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;

  // Non-consuming. Distinguishes "wrong nonce" from "expired or already used",
  // so the callback can offer confirmation rather than a generic failure.
  peek(tokenHash: Buffer, now: Timestamp): Promise<MagicLinkToken | null>;
}

interface RateLimiter {
  check(key: string, limit: number, windowMs: number):
    Promise<{ allowed: boolean; retryAfterSeconds: number }>;
}

// platform/vault
interface VaultPort {
  resolve(ref: VaultRef): Promise<string>;   // never logged, never cached to disk
  store(path: string, secret: string): Promise<VaultRef>;
}
```
CheckRequest and RelationshipUpdate have different subject types on purpose. Only a user or a pool asks an authorization question. A company appears as the subject of project#company@company, which is how a project inherits from its company, and is never itself a caller.

**The development adapter reads from environment variables**. A reference vault://opintel/idp/{companyId}/{provider} resolves to OPINTEL_SECRET_<uppercased path>. Production uses a real secret manager behind the same port. A resolved secret is held in memory for the duration of the call and never written anywhere.

**The callback consumes only on a nonce match. consume includes the nonce in its WHERE clause, so a link opened in a different browser leaves the row untouched and available. The callback then calls peek to tell apart a nonce mismatch, which offers confirmation, from an expired or already-used link, which does not.

consumeConfirmed is the only path that ignores the nonce, and it runs only after the person has answered the confirmation prompt. Declining consumes the token too, so a declined link cannot be retried.

**The outbox never stores a secret. A magic link enqueues { tokenId }, not a URL. At dispatch the adapter loads the token record, reconstructs the link from the plaintext held only in memory since issue, and sends it. A row in mail_outbox is therefore not sufficient to sign in as anyone.

That constrains issuance: the plaintext token exists in memory for the duration of the request and is never written. If dispatch happens in a later process, the link cannot be reconstructed and the send fails, which is correct. **Magic link mail dispatches in-process, immediately after commit, rather than through the polling worker.

**`CurrentUser` is assembled, not stored.** The session holds `userId`; the request pipeline reads the account and composes `CurrentUser`. Storing a name or timezone in Redis would mean a profile edit leaves stale copies in every live session.

**A session id is a bearer credential.** `read` takes no requesting user, because possession is the claim. D-009 is about the cookie being bound to its session, and replay by another user is prevented by the cookie's attributes rather than by a check inside the port.

**Self-revocation is the caller's concern.** The route knows its own session id and passes it as `except` to `revokeAllFor`, and sets `current` on each summary. The port does not need ambient request context.

**`Tx` deliberately exposes no lifecycle methods.** A callback that could call `commit` or `release` would be able to defeat the scope, which is the one thing the scope exists to prevent.


**null from estimateRowCount means the source cannot estimate**, not that the call failed. The distinction matters at query planning: an unknown row count means the cardinality check cannot run, so the query is refused with unsupported_pushdown rather than executed blind. An error means the source was unreachable, which is a different refusal.

**Provisioning withholds a dependent file until its predecessor is registered**. Writing files in order does not guarantee the watcher observes them in order, and a restatement arriving before its original is a different scenario from the one the fixture intends.

### The outbox

```sql
create table outbox_mail (
  id              uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  recipient       text not null,
  template        text not null,
  vars            jsonb not null,
  state           text not null default 'pending'
                    check (state in ('pending','sent','failed')),
  attempts        integer not null default 0,
  last_error      text,
  claimed_at      timestamptz,
  send_after      timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  sent_at         timestamptz
);
create index on outbox_mail (state, send_after) where state = 'pending';
```

**Enqueue happens inside the caller's transaction.** A rolled-back transaction leaves no row, so no mail is sent. That is the entire point of the pattern.

**Claiming is `FOR UPDATE SKIP LOCKED`**, so several dispatchers can run without sending twice:

```sql
update outbox_mail set state = 'pending', claimed_at = now(), attempts = attempts + 1
where id in (
  select id from outbox_mail
  where state = 'pending' and send_after <= now()
  order by send_after limit 10
  for update skip locked
)
returning *;
```

**Retry** is exponential with jitter: 1m, 5m, 25m, 2h, 10h. After five attempts the row becomes `failed` and stays for inspection. Nothing is deleted.

**A send that succeeds but whose database update fails** will be retried, and the same message may be delivered twice. `idempotency_key` lets a real provider deduplicate. **At-least-once is the guarantee**, and it is the right one: a duplicate magic link is an annoyance, a lost one is a locked-out user.

**The dispatcher polls every 5 seconds** in Slice 1. `LISTEN/NOTIFY` is a later optimisation.

**The local file adapter** writes to `MAIL_OUTPUT_DIR`, default `./tmp/mail`, one JSON file per message named `{timestamp}-{idempotencyKey}.json`, and logs the magic link URL to stdout so a developer can click it. Templates render in the adapter from `vars`; nothing above the adapter composes a message body.

---

# 2. API contracts

## 2.1 Conventions

| Concern | Rule |
|---|---|
| Style | REST over HTTPS. JSON only. No GraphQL in any slice |
| Base | `/api/v1`. The version is in the path and changes only on a breaking change |
| Naming | Plural nouns, kebab-case paths, camelCase bodies |
| Nesting | At most one level: `/projects/:id/pools`. Deeper resources are top level with a filter |
| Time | RFC 3339 with offset, always UTC on the wire. The client renders in the user's zone |
| Ids | Branded UUIDs as strings |
| Casing | Request and response bodies are camelCase. The database is snake_case. The mapping happens in the repository, never in a handler |

**Every request and response is validated by a Zod schema at the boundary.** The same schemas generate the OpenAPI document and the typed client. There is no hand-written client.

```ts
// modules/pools/api/schemas.ts
export const CreatePoolBody = z.object({
  name: z.string().min(1).max(80),
  boundSourceIds: z.array(z.string().uuid()).max(20),
  modes: z.object({ query: z.boolean(), prompt: z.boolean() }),
});
export const PoolView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  boundSources: z.array(SourceSummary),
  modes: z.object({ query: z.boolean(), prompt: z.boolean() }),
  clearRatio: z.number().min(0).max(1),
  agentCount: z.number().int(),
  keyPrefix: z.string(),
  keyCreatedAt: z.string().datetime({ offset: true }),
});
export type PoolView = z.infer<typeof PoolView>;
```
**Authenticated handlers receive the caller**. A route declaring a permission other than public receives actor on the request, typed as CurrentUser. The type guarantees it: a handler on an authenticated route cannot compile without one, and a handler on a public route has no actor field to read.

```ts
type PublicRequest        = { /* body, query, params, requestId */ };
type AuthenticatedRequest = PublicRequest & { actor: CurrentUser };
```

**The server assembles CurrentUser once**, from the session and the account, and passes it down. A handler never reads a cookie, never touches SessionPort, and never imports anything from the identity module.

**Assembling CurrentUser costs one account read per authenticated request**. That is accepted rather than cached, because a cache of user records is a second source of truth for identity and the failure mode is someone acting with a stale role after a change.

The read is a primary key lookup on user_account. If it becomes measurable, the answer is to measure first: §8.3's request duration histogram will show it, and a short-lived cache keyed on the session id with explicit invalidation on account change is the remedy, not a default.

## 2.2 The response envelope

Success returns the resource directly. Errors always use one shape:

```jsonc
{
  "error": {
    "code": "entitlement_missing",
    "message": "warehouse.public.orders.tax_id has no entitlement for this pool.",
    "details": { "elementId": "…", "poolId": "…" },
    "requestId": "req_8f21a3",
    "retryable": false
  }
}
```

**`message` is written for a human and appears in the UI unchanged.** It states what happened and what to do. It never contains a stack trace, a SQL fragment, or an internal identifier the user cannot act on.

## 2.3 Pagination

Cursor-based everywhere. Offset pagination is forbidden because the catalog and the run log both grow while being read.

```
GET /api/v1/projects/:id/elements?cursor=eyJ…&limit=100&prefix=public.orders
-> { "items": [...], "nextCursor": "eyJ…" | null }
```

`limit` defaults to 50, maximum 500. A request above the maximum is clamped, not rejected, and the response says so in a `Warning` header.

## 2.4 Idempotency

Every non-GET route accepts `Idempotency-Key`. It is **required** on: pool creation, key rotation, key revocation, source deletion, bulk entitlement set, and export creation.

The key, the route, and a hash of the body are stored for 24 hours. A repeat with the same key and body returns the original response. A repeat with the same key and a different body returns `409 idempotency_key_reused`.

## 2.5 Slice 1 endpoints

### identity

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/providers?email=` | Which routes are available. Safe before submit |
| POST | `/auth/request-link` | Always 202, constant time |
| POST | `/auth/callback` | `{ token, deviceNonce }`, sets the cookie. Returns `deviceMismatch: true` instead of a session when the nonce differs |
| POST | `/auth/confirm-device` | `{ token, deviceNonce, confirm: true }`. The explicit "yes, I opened this myself". Consumes the token and sets the cookie. Declining consumes the token and creates nothing. The confirmation is recorded on the session |
| GET | `/auth/oidc/:provider/start` | PKCE, state, nonce |
| GET | `/auth/oidc/:provider/callback` | Validates, links, sets the cookie |
| POST | `/auth/logout` | |
| GET | `/auth/me` | User, memberships, effective permissions |
| GET / DELETE | `/auth/sessions[/:id]` | List, revoke |

### tenancy

| Method | Path |
|---|---|
| POST / GET | `/companies` |
| GET / PATCH | `/companies/:id` |
| POST / GET | `/projects` |
| GET / PATCH | `/projects/:id` |
| POST | `/projects/:id/migrate-industry` (dry run via `?dryRun=true`) |
| GET | `/projects/:id/members` |
| POST / GET | `/projects/:id/invitations` |
| DELETE | `/invitations/:id` |
| PATCH / DELETE | `/projects/:id/members/:userId` |
| GET | `/projects/:id/permissions/:userId/explain` |

### Company and project payloads

```ts
const CreateCompanyBody = z.object({
  name: z.string().min(1).max(120),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
});

const CreateProjectBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(80),
  industryId: z.string().uuid(),
  region: RegionSchema,              // immutable thereafter
});

const ProjectView = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  name: z.string(),
  industry: z.object({
    id: z.string().uuid(),
    name: z.string(),
    inheritedTermCount: z.number().int(),
  }),
  region: RegionSchema,
  createdAt: z.string().datetime({ offset: true }),
});

const UpdateProjectBody = z.object({ name: z.string().min(1).max(80) });
// region and industryId are absent by design. Region never changes;
// industry changes only through migrate-industry.

const CompanyView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
```
### List payloads

```ts
const ProjectListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  region: RegionSchema,
  company: z.object({ id: z.string().uuid(), name: z.string() }),
  industry: z.object({ id: z.string().uuid(), name: z.string() }),
  role: z.enum(['admin', 'operator', 'viewer']),   // this user's role here
});

const ProjectListResponse = z.object({
  items: z.array(ProjectListItem),
  nextCursor: z.string().nullable(),
});

const CompanyListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: z.enum(['admin', 'member']),
  projectCount: z.number().int(),
});

const IndustryListItem = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  inheritedTermCount: z.number().int(),
  hasDemoPack: z.boolean(),
});
```

**GET /projects returns only projects the caller can reach**, each carrying its company and industry so the chooser and the drawer need no second request. The user's role is included because the drawer and the chooser both show what they may do there.

**There is no selected-project state on the server**. The active project is in the URL, and every project-scoped route carries it. The switcher reads the current project from the route and the list from GET /projects. A server-side "last project" would be state to keep in sync for no benefit.

**The breadcrumb is composed from the current project's ProjectListItem**: company name, then project name, then screen. No separate lookup.

**Creation returns 201 with the created resource**. No Location header: the SPA routes client-side and already has the id from the body.

**Archived projects are excluded by default**. GET /projects returns only projects with archived_at null. ?includeArchived=true includes them, each carrying archivedAt so the caller can distinguish. The chooser and the switcher use the default; a settings surface that lists archived projects asks for them explicitly.

**projectCount counts only projects the caller can reach**, not every project in the company. A company admin sees all of them by inheritance and therefore sees the true total. An operator on two of a company's ten projects sees 2, which is the honest answer to "how many projects are here for me" and avoids disclosing that eight others exist.

**GET /industries is platform scope and needs only authentication**. Industries are shared across every customer, so there is nothing tenant-specific to authorize. It is not paginated: the list is short by construction, and a vertical Opintel has not built a pack for should not be in it.

**hasDemoPack tells the create screen whether evaluation is possible without a database**. An industry with no pack is still a legitimate choice, and the screen says so rather than hiding it.

### Invitation payloads

```ts
const CreateInvitationBody = z.object({
  email: z.string().email(),
  companyId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  role: z.enum(['admin', 'operator', 'viewer']),
});

const InvitationListItem = z.object({
  id: z.string().uuid(),
  email: z.string(),
  companyId: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  role: z.enum(['admin', 'operator', 'viewer']),
  invitedBy: z.object({ id: z.string().uuid(), email: z.string() }),
  expiresAt: z.string().datetime({ offset: true }),
  createdAt: z.string().datetime({ offset: true }),
});
```

| Method | Path |
|---|---|
| POST | `/projects/:id/invitations` |
| GET | `/projects/:id/invitations` |
| DELETE | `/invitations/:id` |


**Invitations last 7 days**. Longer makes a leaked link a standing risk; shorter irritates people who read email weekly.

**Item 2.7 creates project invitations only**. projectId must be non-null and match the project id in the URL, and companyId must name that project's company. Company invitations are not supported by these routes.

**There is no separate acceptance endpoint**. An invitation is delivered as a magic link carrying invite_id, so acceptance is a sign-in that happens to also accept. That means one code path, one atomic transaction, and no way to accept without proving control of the address.

**The invitation's email is the identity**. The token's invite_id names the exact invitation; the account is found or created for the email on the invitation, not on anything the caller supplies. A magic link carrying an invitation for one address cannot enrol another.

**Acceptance creates a session**, because the person has just proven control of the address by the same mechanism as any sign-in.

**Revoking deletes the pending_invite row**. An outstanding magic link carrying that invite_id then signs the person in without granting anything, which is correct: they proved control of the address, and the grant was withdrawn.

### Permission explanation

`GET /projects/:id/permissions/:userId/explain` returns every project permission with its verdict and derivation.

```ts
const PermissionExplanation = z.object({
  permission: z.string(),
  allowed: z.boolean(),
  path: z.array(z.string()),      // SpiceDB's own trace, in order
  via: z.enum(['project', 'company', 'none']),
});

const ExplainResponse = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string() }),
  projectRole: z.enum(['admin', 'operator', 'viewer']).nullable(),
  companyRole: z.enum(['admin', 'member']).nullable(),
  permissions: z.array(PermissionExplanation),
  checkedAt: z.string().datetime({ offset: true }),
  token: z.string(),              // the ZedToken the checks ran against
});
```
**via is the field the screen actually uses**. A permission held through company administration looks identical to one granted on the project until you ask why, and that difference is what someone reviewing access needs to see. For an allowed check, an existing project_member row yields project; otherwise a company_member admin row yields company. All other cases yield none. The verdict comes from SpiceDB, and via comes from membership rows, never trace branches.

**path is SpiceDB's trace, unmodified**. It is supplementary detail and may be thinner on a cache hit or empty. An allowed check with an empty path is normal and never causes an error.

**All permissions are checked in one checkMany**, against one consistency token, so the response is a coherent snapshot rather than independent checks at different moments. A traced bulk check fails closed if SpiceDB cannot supply a complete verdict snapshot; individual cached checks are not substituted.

**SpiceDB dispatch caching stays enabled** in development, tests and production. Trace depth does not determine allowed or via.

**The caller needs project#view** to explain anyone's permissions on that project. Seeing who can do what is part of viewing a project.

### Project members

```ts
const ProjectMemberListItem = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string(),
    fullName: z.string().nullable(),
  }),
  projectRole: z.enum(['admin', 'operator', 'viewer']).nullable(),
  companyRole: z.enum(['admin', 'member']).nullable(),
  via: z.enum(['project', 'company', 'both']),
  grantedAt: z.string().datetime({ offset: true }).nullable(),
  grantedBy: z.object({ id: z.string().uuid(), email: z.string() }).nullable(),
});
```

GET /projects/:id/members returns `{ items: ProjectMemberListItem[], nextCursor: string | null }`, cursor-paginated by user id. The caller needs project#view.

**The list includes inherited company members**, deduplicated by user. Someone administering the company appears here even with no project_member row, because they can reach the project and an access review that omitted them would be wrong.

**via is computed once on the list** so the screen can show the distinction without calling explain for every row. both means a direct grant and company inheritance, which is worth showing: revoking the project grant would not remove their access.

**grantedAt and grantedBy are null for inherited members**, since nothing was granted on this project. That absence is itself the answer to "who gave them this".


### sources and catalog

| Method | Path |
|---|---|
| POST | `/projects/:id/sources` |
| POST | `/projects/:id/sources/from-demo` | `{ demoTemplateId }`. Provisions and introspects. Same downstream path as any source |
| POST | `/projects/:id/sources/test` (validates before saving) |
| GET / PATCH / DELETE | `/sources/:id` |
| POST | `/sources/:id/introspect` |
| GET | `/projects/:id/sources/:sourceId/introspections` |
| GET | `/projects/:id/introspections/:runId` (includes the diff) |
| POST | `/sources/:id/sampling-consent` |
| GET | `/projects/:id/elements` (cursor, prefix, treatment, undecided filters) |
| POST | `/projects/:id/introspections/:runId/cancel` |
| GET | `/elements/:id` |
| PATCH | `/elements/:id` (description only) |

### vocabulary

| Method | Path | Notes |
|---|---|---|
| GET | `/industries` | Platform scope. Name, slug, and inherited counts for the create-project picker |
| GET | `/industries/:id` | Includes example terms, so the picker can show what the choice brings |
| GET | `/industries/:id/demo-sources` | The demo pack for an industry. Name, narrative, what it demonstrates |
| GET | `/projects/:id/vocabulary` | **The effective merge.** Every term with `source: inherited \| project` |
| POST | `/projects/:id/vocabulary/terms` | Creates a project-scope term, overriding an inherited one if names collide |
| PATCH / DELETE | `/vocabulary/terms/:termId` | Project scope only. Industry terms are not writable here |
| GET | `/projects/:id/vocabulary/export` | The reviewable artifact: every term, its readiness, JSON or CSV |
| GET | `/projects/:id/vocabulary/readiness` | Per concept: declared, inferred, ambiguous, unmapped |
| GET | `/industries/:id/discovery-questions` | The structured question set for a deployment |
| GET | `/projects/:id/discovery-coverage` | Asked, clarified, unresolved |
| GET | `/projects/:id/vocabulary/unmapped` | Terms used in prompts with no mapping, with occurrence counts |
| GET | `/projects/:id/vocabulary/candidates` | Expressions resolved by similarity rather than exact match |
| POST | `/vocabulary/candidates/:id/accept` | Adds as a synonym and re-embeds |
| POST | `/admin/industries/:id/publish` | **Platform administrators only.** Bumps the version, fans out invalidation |

`GET /projects/:id/vocabulary` is the only vocabulary route a screen calls for reading. Nothing consumes the raw industry pack directly, because that would push the merge into the client.

### entitlements

| Method | Path |
|---|---|
| GET | `/pools/:id/entitlements` |
| PUT | `/pools/:id/entitlements/:elementId` |
| POST | `/pools/:id/entitlements/bulk` (requires `justification` when treatment is `clear`) |
| GET | `/pools/:id/view-definition` (the compiled DDL, admin only) |
| GET / POST / DELETE | `/projects/:id/pattern-rules[/:ruleId]` |

### pools

| Method | Path |
|---|---|
| POST / GET | `/projects/:id/pools` |
| GET / PATCH / DELETE | `/pools/:id` |
| POST | `/pools/:id/keys/rotate` |
| POST | `/pools/:id/keys/revoke` (typed confirmation in body) |
| GET | `/pools/:id/agents` |
| GET | `/pools/:id/agents/:agentId` |

### querying and evidence

| Method | Path |
|---|---|
| POST | `/projects/:id/runs` (the Workbench; SSE response) |
| POST | `/runs/:id/clarify` (resume a paused run) |
| GET | `/projects/:id/runs` (cursor, filters) |
| GET | `/runs/:id` |
| POST | `/projects/:id/exports` |
| GET | `/exports/:id` (status, then a signed download URL) |

### streams

| Method | Path |
|---|---|
| GET | `/projects/:id/stream` (SSE: presence, catalog changes, counts) |
| GET | `/runs/:id/stream` (SSE: stage progress, clarification, result) |


### Industry migration

`POST /projects/:id/migrate-industry`, with `?dryRun=true` for the preview.

```ts
const MigrateIndustryBody = z.object({
  industryId: z.string().uuid(),
  confirmation: z.string(),        // ignored on a dry run
});

const MigrateIndustryPreview = z.object({
  from: z.object({ id: z.string().uuid(), name: z.string(), termCount: z.number().int() }),
  to:   z.object({ id: z.string().uuid(), name: z.string(), termCount: z.number().int() }),
  shadowedTerms: z.array(z.object({ name: z.string(), kind: z.string() })),
  projectTermsRetained: z.number().int(),
  entitlementsAffected: z.literal(0),
  confirmationPhrase: z.string(),
});
```

**The confirmation phrase is the project's name**. The dry run returns it, and the migration refuses unless confirmation matches exactly, case sensitive. Typing a project's name is the standard bar for an irreversible change and needs no new vocabulary.

**entitlementsAffected is 0 by construction, and typed as a literal so it cannot drift**. It appears in the preview because the question a reviewer asks is "what does this break", and the honest answer is the vocabulary and nothing else.

**shadowedTerms lists project-scope terms that shadow a term in the new industry**. They are retained and still win. Nothing is deleted.

**Migration increments the project revision**. EffectiveVocabulary.version is industryVersion + projectRevision, and without the bump a cached effective vocabulary from the old industry would still look current. The increment happens regardless of whether the two industries' vocabulary versions differ, because the merged result changed either way.

**Migration returns 200 with ProjectView**, reflecting the new industry and its inherited term count. The caller already has the project on screen and needs the updated view; a bare 204 would force a refetch.

### Source payloads

```ts
const TestSourceBody = z.object({
  kind: z.literal('postgres'),
  credentialRef: z.string().startsWith('vault://'),
});
const TestSourceResponse = z.object({
  reachable: z.boolean(),
  reason: z.string().nullable(),
  schemas: z.array(z.string()),          // populated only when reachable
});

const CreateSourceBody = z.object({
  name: z.string().min(1).max(80),
  kind: z.literal('postgres'),
  credentialRef: z.string().startsWith('vault://'),
  includeSchemas: z.array(z.string()),   // empty means every readable schema
  samplingConsent: z.boolean(),
  receivesLandings: z.boolean(),
  landingStrategy: z.enum(['append_as_at', 'table_per_filing']).nullable(),
});

const SourceListItem = z.object({
  id: z.string().uuid(),
  name: z.string(),
  duckdbAlias: z.string(),
  kind: z.string(),
  origin: z.enum(['customer', 'demo']),
  status: z.string(),
  error: z.string().nullable(), // latest run’s safe actionable message, rendered unchanged
  landingStrategy: z.enum(['append_as_at', 'table_per_filing']).nullable(),
  filingCount: z.number().int().nullable(),
  elementCount: z.number().int(),
  undecidedCount: z.number().int(),
  lastIntrospectedAt: z.string().datetime({ offset: true }).nullable(),
});
```

**GET /projects/:id/sources requires project#view**. Creation returns 201 with SourceListItem and queues introspection.

**Cancelling requires project#bind_source** and returns 200 with the updated IntrospectionRunView. A run not in queued, connecting or reading returns conflict, naming its current state. It invalidates the run detail, the run list and the source list.

**Source recovery.** `POST /sources/:id/introspect` accepts `{ projectId }` and returns 202 with SourceListItem. The project identifies the tenant scope; `project#bind_source` is checked before the source is read, and a source outside that project returns 404. The source is locked while checking for an active run and enqueueing a new one. Archived sources and duplicate active runs return conflict. Retry keeps the existing schema selection and sampling consent. Queued/active runs appear as pending; a new run clears the displayed error without changing earlier runs.

The failed-source Retry action uses this endpoint. For a demo source it resumes the prepared delivery before introspection. Repeating `POST /projects/:id/sources/from-demo` (or `demo:pack provision`) reuses the reserved source, verifies its project/template/credential/name/strategy binding and preserves prior runs and arrivals. A new source returns 201; resumed or already active work returns 202; an already completed connection returns 200. No deletion is part of recovery. Only one new run is queued. The worker claims the run in Postgres before provisioning, so API and CLI workers cannot prepare the same run concurrently. Sidecar replay keeps file bytes, filing IDs, hashes and provenance unchanged.


### Introspection run payload

```ts
const IntrospectionRunView = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  state: z.enum(['queued', 'connecting', 'reading', 'diffing', 'complete', 'failed', 'cancelled']),
  progress: z.object({ objects: z.number().int(), total: z.number().int().nullable() }),
  error: z.string().nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  diff: z.array(z.object({
    change: z.enum(['added', 'removed', 'renamed', 'type_changed', 'collision']),
    elementId: z.string().uuid().nullable(),
    duckdbName: z.string().nullable(),
    before: z.string().nullable(),
    after: z.string().nullable(),
    breaking: z.boolean(),
  })).nullable(),
});
```

**Introspection runs are nested under the project**, so they never collide with query runs at `/runs/:id`.

**An empty diff on a complete run is stated plainly**: "No changes since the last introspection."

**Cancel is offered only in queued, connecting and reading**, per the §1.5 state machine.

Item 3.15 links source names to `/projects/:id/sources/:sourceId/introspections`
and run rows to `/projects/:id/introspections/:runId`. The history API returns
`{ items: IntrospectionRunView[], nextCursor: string | null }`, newest run IDs
first, with cursors bound to both project and source. Active views poll every
five seconds pending item 3.16, stopping at terminal state. New persisted diffs
retain exposed names and rename before/after facts so subsequent discovery does
not rewrite historical presentation. Older diffs may lack those optional facts.



### Introspection runs

| Method | Path | Permission |
|---|---|---|
| GET | `/projects/:id/sources/:sourceId/introspections` | `project#view` |
| GET | `/projects/:id/introspections/:runId` | `project#view` |

```ts
const IntrospectionRunView = z.object({
  id: z.string().uuid(),
  sourceId: z.string().uuid(),
  state: z.enum(['queued', 'connecting', 'reading', 'diffing', 'complete', 'failed', 'cancelled']),
  progress: z.object({ objects: z.number().int(), total: z.number().int().nullable() }),
  error: z.string().nullable(),
  startedAt: z.string().datetime({ offset: true }).nullable(),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  diff: z.array(z.object({
    change: z.enum(['added', 'removed', 'renamed', 'type_changed', 'collision']),
    elementId: z.string().uuid().nullable(),
    duckdbName: z.string().nullable(),
    before: z.string().nullable(),
    after: z.string().nullable(),
    breaking: z.boolean(),
  })).nullable(),
});
```

**Introspection runs are nested under the project**, so they never collide with query runs at `/runs/:id`.

**An empty diff on a complete run is stated plainly**: "No changes since the last introspection."

**Cancel is offered only in queued, connecting and reading**, per the §1.5 state machine.



`SourceListItem.error` carries the latest run's reviewed, value-free message, or null. Provisioning messages are validated against reviewed text at the sidecar boundary, persisted and rendered unchanged. The declared error code is retained in run progress as `errorCode` for CLI diagnostics. Unknown exception/peer text is replaced by an actionable safe fallback, never copied from SQL, credentials or a stack trace. The CLI exits unsuccessfully when background preparation fails instead of reporting a successful connection.

**undecidedCount equals elementCount until item 4.1**, since undecided is the absence of an entitlement row and no rows can exist yet. The screen shows the real number rather than hiding the column.

**landingStrategy is required when receivesLandings is true**, refused otherwise.

**`demo_source_template.deployment_ref` is a map keyed by project id:**

```ts
type DeploymentRef = Record<string, {
  sourceId: SourceId;        // reserved at prepare, inserted at Connect
  credentialRef: VaultRef;
  landingZone: string | null;
  sourceName: string;
}>;
```

**Preparation reserves the source id and inserts nothing into `data_source`.** The sidecar binds its landing zone to that project and source at prepare time, because it needs them before any file arrives. The application creates the `data_source` row only when someone clicks Connect.

**A project with a prepared template therefore still has no sources.** The offer is visible, nothing is provisioned, and E2-013 holds. Preparation is deployment work; connection is a decision someone makes.

**A template with no entry for this project is not connectable there.** `POST /sources/from-demo` returns `dependency_unavailable`, and the card says the pack is not provisioned for this project rather than failing on click.

Source listing uses `{ items: SourceListItem[], nextCursor: string | null }`,
with the standard `cursor` and `limit` query parameters. Counts exclude removed
catalogue objects/elements; filing counts include every registered outcome.
`status: introspection_failed` in the list also exposes a failed/cancelled latest
run without presenting it as still pending. The source’s durable reachability
status remains separate.

`GET /industries/:id/demo-sources?projectId=...` checks `project#view` and that the
industry matches the project. It returns `{ id, name, narrative, prepared,
connected }[]`; deployment references are never sent to the browser. Both connect
mutations invalidate `dataSource.lists` and `project.stats`.

Source and initial introspection run are saved in one transaction. The run keeps
the initiating user and explicit sampling-consent decision in its progress
metadata. The application dispatches it after commit; listing sources resumes
queued registration work after an application restart. Demo introspection waits
for ordinary landed/quarantined/duplicate arrival notices so it cannot catalogue
an empty database before the watcher has processed the pack. Failed preparation
is recorded on the run; the source row and any landed files remain available.


### Catalogue tree

The console explorer is at `/projects/:id/catalog`, reached from **Data sources → Explore schema**. Item 3.14 prepares `elementKeys.all(projectId)` for structural invalidation; SSE wiring remains item 3.16.

```ts
const CatalogNode = z.object({
  kind: z.enum(['source', 'schema', 'object', 'element']),
  id: z.string(),                    // sourceId, "sourceId:schema",
                                     // objectId, or elementId
  label: z.string().nullable(),      // null only for unnameable elements
  childCount: z.number().int().nullable(),   // null for elements
  duckdbType: z.string().nullable(),         // elements only
  state: z.enum(['undecided', 'entitled', 'withheld', 'unsupported', 'unnameable']).nullable(),
});

const CatalogTreeResponse = z.object({
  nodes: z.array(CatalogNode),
  nextCursor: z.string().nullable(),
});
```
**GET /projects/:id/catalog?parent=&prefix=&cursor= returns one level**. Omitting parent returns the sources. A node's id is opaque to the client and carries its own scoping, so public.orders in two sources are different nodes and never collide.

**prefix filters within the requested level**, not across the tree. Searching at the project level searches sources; searching inside an object searches its elements. Cross-tree search is a different feature and is not in Slice 1.

**Requires project#view**. Cursor paginated at every level, because an object can have two thousand elements.

**The explorer shows the stored DuckDB type for every element, with its state alongside**. An undecided element displays its mapped type and undecided, because an administrator deciding what to release needs to know whether the column is a number or text — that is most of the decision.

**describe is different**. It omits undecided elements entirely, per §4.4, because an agent must not learn that a column exists before someone has decided about it. The console shows what exists; the agent interface shows what was decided. That asymmetry is deliberate and is the reason the two are separate contracts.

**An unnameable element has no label and no type**. It is listed so an administrator can see it exists and fix the source column or give it an alias. Substituting the source identifier would put an unnormalised string where a DuckDB name belongs and imply the element is addressable.

## 2.6 The agent interface

Separate from the console API. Streamable HTTP at `/mcp/v1/p/:projectId`, authenticated by the pool key as a bearer token.

**Slice 1 tools:** `opintel.describe`, `opintel.query`, `opintel.explain`, `opintel.ask`, `opintel.respond_clarification`.

Tool availability is driven by pool configuration and a `notifications/tools/list_changed` is emitted when it changes.

**The response contract that matters most.** Reduction appears in the text content the model reads, not only in structured fields:

```jsonc
{
  "content": [
    { "type": "text",
      "text": "38 rows. 3 elements were withheld: tax_id, bank_account, salary_band. email was returned tokenized." },
    { "type": "resource", "resource": { "mimeType": "application/json", "text": "{…rows…}" } }
  ],
  "_meta": { "recordId": "run_8f21", "reduced": true, "elements": [ … ] }
}
```

If a withheld field is merely absent from the JSON, the model concludes the data does not exist and reasons confidently over a partial picture. Everything else in the system degrades visibly. This degrades silently, which is why it is a contract and not a nicety.

## 2.7 The sidecar contract

Internal, mutually authenticated, not public.

| Method | Path | Purpose |
|---|---|---|
| POST | `/health` | Sidecar and contract versions; no request body or source contact |
| POST | `/test-connection` | Test a source through its vault reference |
| POST | `/estimate` | Source row estimate, or null when unavailable |
| POST | `/introspect` | Structure only. Returns no row data in schema mode |
| POST | `/sample` | Reads real values. Refuses without the consent flag |
| POST | `/validate` | Parses and plans against view definitions. Opens no source connection |
| POST | `/execute` | Governed SQL plus view definitions and limits. Returns rows |

`execute` carries an `entitlementContext` field, null in Slices 1 and 2, populated in Slice 3.

**Cancellation is the HTTP request being aborted**. There is no cancel endpoint. The application aborts its request; the sidecar sees the connection close and cancels the source query through pg_cancel_backend, then releases the connection. A sidecar that cannot cancel still releases on timeout.


### The wire contract

All requests are `POST`, JSON, over mutual TLS. The sidecar presents a certificate the application pins; the application presents one the sidecar pins. There is no bearer token: the certificate is the identity.

```ts
type SidecarRequest<T> = {
  requestId: string;              // the application's request id, for correlation
  projectId: ProjectId;
  sourceId: SourceId;
  credentialRef: VaultRef;        // the sidecar resolves it, the application never holds the secret
  payload: T;
};

// POST /health  -> no body
type HealthResponse = {
  version: string;                // semver of the sidecar
  contract: number;               // wire contract version, currently 1
  duckdb: string;
};

// POST /test-connection -> testConnection
type TestConnectionPayload = Record<string, never>;
type TestConnectionResponse = { reachable: true } | { reachable: false; reason: string };

// POST /introspect -> introspect
type IntrospectPayload = { include: string[] };      // exact schema names; empty selects readable non-system schemas
type IntrospectResponse = { snapshot: CatalogSnapshot };

// POST /sample -> sampleTopValues
// Refused unless the source carries sampling consent. The sidecar does not
// decide that; the application does, and passes it explicitly so the refusal
// is visible in the sidecar's own logs.
type SamplePayload = {
  consentGiven: true;
  elements: Array<{ elementId: ElementId; schema: string; object: string; column: string }>;
  limit: number;
};
type SampleResponse = { values: Record<string, TopValue[]> };

// POST /estimate -> estimateRowCount
type EstimatePayload = { object: { schema: string; name: string } };
type EstimateResponse = { rows: number | null };     // null when the source cannot estimate
// POST /landing-receipt — sidecar to application; arrival notices and count reports below also leave the sidecar
type LandingReceipt = {
  filingId: FilingId;
  sourceId: SourceId;
  projectId: ProjectId;
  partyCode: string;
  kind: string;
  period: string;
  asAt: string | null;
  strategy: 'append_as_at' | 'table_per_filing';
  landedTable: string;
  rowCount: number;
  fileSha256: string;
  supersedes: FilingId | null;
  landedAt: string;
};
```

S1 serves the five source-connector endpoints as a standalone HTTPS process.
Every endpoint requires the pinned application certificate. Request schemas,
response schemas, the application client and `sidecar/openapi.json` share the
Zod wire definitions. Sampling consent refusal maps to HTTP 403. Audit records
are append-only, fsynced local JSONL containing identifiers, consent and outcome;
no source values or resolved credentials enter them. The development CLI uses
`DevelopmentVaultAdapter`; the host accepts an injected `VaultPort`.

S1 reports `duckdb: "not-loaded"` in health because it does not create a DuckDB
engine. `/validate` and `/execute` belong to S2 and are not mounted by S1.
The built wire contract is 1 and the independently reported sidecar version
starts at 0.1.0. Local bootstrap creates expiring development certificates and
starts the host; it does not build the S5 deployment package.

**A contract mismatch fails loudly.** The client calls `/health` on first use and refuses if `contract` differs from the version it was built against. A sidecar upgraded ahead of the application, or behind it, stops rather than guessing.

**`consentGiven` is always `true` when present.** The application never sends `false`; it simply does not call `/sample`. The field exists so a sidecar operator auditing their own logs can see that consent was asserted for every sampling request.

**include holds exact schema names, not patterns**. An empty array means every schema the credential can read, excluding pg_catalog, information_schema and anything beginning pg_. Patterns were rejected because a pattern that silently starts matching a new schema would introspect data nobody chose to expose, and the set of schemas is small enough to enumerate.

**Identifiers are never string-concatenated**. SamplePayload carries schema, object and column as separate fields:

**The sidecar calls the application, not the reverse, for receipts**. Mutual TLS runs in both directions on the same certificate pair.

**The first receipt for a source fixes its strategy**. The application writes landing_strategy on the data_source row if it is null, and refuses the receipt if it is set and differs, naming both. The sidecar enforces the same rule locally, so a lost connection cannot produce a filing under the wrong strategy. Two enforcements of one rule, because either alone has a window.

**Receipt delivery implementation.** The application serves `/landing-receipt` on a dedicated pinned-mTLS listener, using the same certificate pair in reverse. Both certificates need serverAuth and clientAuth EKUs. The shared Zod payload generates `sidecar/landing-receipt.openapi.json`; acceptance returns 204, conflicts 409, and temporary registration failures 503 with the standard error envelope. Acceptance locks `data_source` and inserts an idempotent, tenant-scoped `landing_receipt` inbox entry in one transaction. An identical retry succeeds; a changed payload for the same filing ID refuses. The first accepted receipt sets `first_landed_at`; a database trigger then prevents changing the strategy or clearing that marker. Runtime configuration is documented in `sidecar/README.md`.

**A receipt the application refuses leaves the filing landed but unregistered**. That is visible rather than silent: the filing register in item 3.10 reports it, and an operator reconciles. The alternative, unlanding the rows, would mean the sidecar undoing a committed write in the customer's database.

```ts
type SamplePayload = {
  consentGiven: true;
  elements: Array<{
    elementId: ElementId;
    schema: string;
    object: string;
    column: string;
  }>;
  limit: number;
};
```
A table named sales.data is then unambiguous, and the sidecar quotes each part when building SQL. **Any wire format that joins identifiers with a separator is wrong**, because the separator can appear inside a name and the ambiguity becomes a query against the wrong table.


// POST /arrival-notice — sidecar to application, for every file, landed or not
```ts
type ArrivalNotice = {
  filingId: FilingId;
  sourceId: SourceId;
  projectId: ProjectId;
  fileSha256: string;
  receivedAt: string;
  revision: number;               // positive, monotonically increasing per filing
  outcome: 'pending' | 'landed' | 'quarantined' | 'duplicate';
  partyCode: string | null;        // null when attribution failed
  kind: string | null;
  period: string | null;
  quarantineCategory:
    | 'no_rule_matched' | 'multiple_rules_matched' | 'unreadable_format'
    | 'sheet_absent' | 'merged_header' | 'formula_uncached'
    | 'locale_undeclared' | 'period_unparseable' | 'verification_mismatch'
    | 'column_type_changed'
    | 'rule_invalid' | 'attribution_missing' | 'header_invalid'
    | null;
};
```
**The application accepts a notice only when its revision exceeds the one stored**. A retried quarantine that lands arrives as a higher revision; a delayed delivery of the older outcome is discarded rather than overwriting it.

**Opintel receives a category, never a reason**. The full reason may contain a cell value, a column name or a filename fragment, and those are the customer's data. The category is enough to say what to fix; the detail stays local and is read through the local register command by whoever operates it. This is the one place the register is deliberately incomplete, and the console says so rather than appearing to show everything.

**GET /projects/:id/filings** lists the register. Reconciliation is local: the sidecar compares its zone against its own state, and reports a count to Opintel rather than a file list.

**Reconciliation schedule.** Run once at startup, then 30 seconds after each successful pass. Consecutive failed passes retry after 30, 60, 120, 240 and then 300 seconds, capped at five minutes. Success resets the delay; restart resets retry state. Recovery and retries of existing arrivals belong to this schedule, not the file scan loop. New arrivals retain one initial processing/delivery attempt. Demo preparation uses the one-second scan default.

**Reconciliation transport.** `/reconciliation-report` uses the same pinned mTLS as receipts and notices. Its `x-opintel-project-id` header binds the tenant scope; the source must exist in that project. Older `checkedAt` reports are discarded. Counts account for current zone entries matched to the durable register; unregistered includes deliveries still settling or entries that cannot safely be read.

**Resolution is a local command**. An operator corrects the rule, re-exports the snapshot, and retries the filing by id. The filing id is preserved, identification and validation re-run, and there is no attribution override — a file is never attributed by hand, because that is exactly the guess ING-08 exists to prevent.


```ts
const FilingListItem = z.object({
  filingId: z.string().uuid(),
  sourceId: z.string().uuid(),
  partyCode: z.string().nullable(),
  kind: z.string().nullable(),
  period: z.string().nullable(),
  outcome: z.enum(['pending', 'landed', 'quarantined', 'duplicate']),
  quarantineCategory: z.string().nullable(),
  supersedes: z.string().uuid().nullable(),
  rowCount: z.number().int().nullable(),
  receivedAt: z.string().datetime({ offset: true }),
  revision: z.number().int(),
});

// POST /reconciliation-report — sidecar to application
type ReconciliationReport = {
  sourceId: SourceId;
  zoneFileCount: number;
  registeredCount: number;
  unregisteredCount: number;
  checkedAt: string;
};
```

**`GET /projects/:id/filings` requires `project#view`.** Cursor paginated.

**Item 3.13 presentation.** The filings pill expands the source row in place and counts only `landed` arrivals. Non-landing sources have no pill or expansion. The client follows register cursors, orders by receipt time (newest first), and shows landed filings for that source, including filing ID, party code, kind, period, receipt time, superseded filing ID and row count. The source's immutable landing strategy explains how versions remain queryable. A missing receipt shows “Awaiting receipt”, never an invented row count. Filenames are not in the application payload.

Quarantines appear in the Dashboard needs-a-decision feed and in Observations, never inside a source. `sourceId` on their notice is the configured zone's transport binding, not evidence that they landed into that source. The feed shows the category, filing ID and receipt time, with local inspection and retry instructions. Detailed reasons stay local. This adds no acknowledge/resolve workflow or attribution override; the observations workflow remains Slice 3. These read-only views refresh the shared filing query every 30 seconds; expansion state is local to project and source.

The console's source expansion selectors are absent from the master stylesheet. Item 3.13 uses existing `toolchip`, `sheetb`, table and `feed` classes; it adds no CSS class or stylesheet changes.



// POST /provision-demo
```ts
type ProvisionDemoPayload = {
  templateId: DemoSourceId;
  schemaSpec: SchemaSpec;
  generatorSpec: GeneratorSpec;
  landingZone: string | null;      // set for spreadsheet templates
};
type ProvisionDemoResponse = { credentialRef: VaultRef; database: string };
```

**The sidecar provisions demo data because demo data is still the customer's environment**. A spreadsheet template writes files into the landing zone and stops: the watcher picks them up through the ordinary path, with no special provisioning route


### Bootstrap. Pre-provisioned, not a writable secret store.

**The sidecar does not create databases**. /provision-demo writes schema and rows into a database that already exists, whose credential the operator configured at the same time as everything else in service.json. Creating databases would need an administrative credential in the sidecar, which is a larger privilege than anything else it holds, for a convenience.

**In development the demo database is a second database on the Compose Postgres**, created by dev:up, with its reference in the development vault adapter. In a deployment it is whatever the customer provisions, and the six-week engagement configures it.

### Item 3.11 implementation: demo delivery

The reinsurance template is published by migration 024 from
`src/modules/sources/demo/reinsurance.json`: twelve initial filing-party workbooks
and a thirteenth restatement. The sidecar demo target declares `database` and
`credentialRef`; only zones using that reference can receive demo files.
Files are named `id_period.xlsx`; the SchemaSpec object named `party_kind` supplies
columns and GeneratorSpec row counts. Dependencies reference earlier file IDs,
not filenames or periods. Prepared workbooks and their template signature stay
outside the zone; retries publish the same bytes without replacement. Arrival
authority remains the ordinary register. See `sidecar/README.md` for bootstrap,
local commands and migration rollback/backfill constraints.



---

# 3. Authentication and authorization

## 3.1 The two mechanisms, kept separate

### `GET /auth/providers`

Takes `email` as a query parameter. Always `200`, always the same shape.

```ts
type ProvidersResponse = {
  magicLink: boolean;              // false only when sso_enforced for this domain
  providers: Array<{
    provider: string;              // 'oidc:google', 'oidc:entra', 'oidc:acme'
    displayName: string;           // 'Google', 'Microsoft', 'Acme SSO'
    startPath: string;             // '/auth/oidc/oidc:google/start'
  }>;
  enforced: string | null;         // the provider to redirect to, or null
};
```

**An unknown domain returns the platform defaults**, exactly as a known domain with no `company_idp` rows does. The two are indistinguishable.

**`enforced` is non-null only when the domain maps to a company with `sso_enforced` set.** The client redirects immediately rather than showing the form. That is the one observable difference, and it reveals only that a domain uses SSO, which is already public.

**When `enforced` is set, `magicLink` is false and `providers` contains exactly one entry**, the enforced provider.

sso_enforced requires exactly one enabled company_idp row. More than one is ambiguous: the sign-in screen is bypassed, so there is nothing to choose from. Setting sso_enforced refuses with conflict when zero or more than one provider is enabled, and disabling the last provider while sso_enforced is set refuses the same way.


**Humans** authenticate with a magic link or an identity provider, hold a session cookie, and are authorized by SpiceDB.

**Agents** authenticate with a pool key. The key is the membership. `agentId` is self-declared and used only for presence and evidence. **Nothing is authorized on it.**

Conflating these is the most likely design error in the system. A code review that finds an authorization check keyed on `agentId` rejects the change.

## 3.2 Sign-in

Browser paths and token transport.

Screen	Path
Sign in	/sign-in
Check email	/check-email
Callback	/auth/callback?token=…
Confirm device	/auth/confirm-device?token=…
Project chooser	/projects
Create project	/projects/new
Create company	/companies/new


The token travels as a **query parameter**, not a fragment. A fragment never reaches the server, which is usually the point, but here the SPA reads it either way and a query parameter survives email clients that rewrite links. The token is single-use and short-lived, so its appearance in a browser history entry is acceptable and is stated in the security review.

**The project chooser is where a signed-in user with no project lands**. It lists the projects they can reach and offers to create one. A user who administers no company is offered company creation first, since a project cannot exist without one.

**Create project is reached from three places**: the chooser, the project switcher in the drawer, and directly by path. The switcher already exists in the shell and currently shows fixture data; wiring it to real projects is part of this item.

**After creation the user lands on the new project's dashboard**, not back on the chooser.

**The device nonce** is stored in localStorage under the key opintel.device_nonce. It is 16 bytes from crypto.getRandomValues, base64url encoded, created on first visit and never rotated. It identifies a browser, not a person, and carries no authority on its own: a matching nonce only avoids a confirmation prompt.

**PKCE state is held in Redis** under oidc:{state} for 10 minutes, single use, deleted on callback:

**The rate limiter fails open**. When its store is unreachable the request is allowed and a warning is logged. This is the one place Opintel does not fail closed, and the asymmetry is deliberate: failing closed here locks every user out of sign-in during a store outage, and reports it as rate_limited, which hides the fault from whoever is trying to fix it.

**Sessions still require Redis**, so an outage stops sign-in regardless. The fallback protects against a slow or flapping store, not a down one.


```ts
type OidcFlowState = {
  codeVerifier: string;       // 43 to 128 chars, base64url
  nonce: string;
  provider: string;
  companyId: CompanyId | null;
  redirectUri: string;
  inviteId: InviteId | null;
  deviceNonce: string;
  createdAt: Timestamp;
};
```
state is 32 bytes from a CSPRNG. A callback whose state is absent, expired or already consumed is refused without saying which.

**ID tokens are verified with openid-client**, which handles discovery, JWKS retrieval and caching. Accepted algorithms are RS256 and ES256 only; none and HMAC variants are refused. Issuer must match the discovered issuer exactly, audience must equal the client id, exp and iat are checked with 60 seconds of clock skew, and nonce must match the one in the flow state. **Code replay is prevented by the single-use flow state**, so no separate replay store is needed.


One screen offers every route the person may use. On email submit:

| Condition | Behaviour |
|---|---|
| Domain maps to a company with SSO enforced | Redirect to that provider. No link sent. Say where they are going |
| Domain maps to a company with SSO available | Send the link, and offer the provider as an alternative |
| Domain matches no company but a pending invitation exists | Send the link with the invitation attached |
| Domain matches nothing | Respond exactly as above. Send nothing. Constant time |

**No account enumeration.** The observable difference is a provider redirect, which is already public information about a domain.

### Magic link

| Property | Value |
|---|---|
| Entropy | 32 bytes from `crypto.randomBytes`, base64url |
| Storage | SHA-256 hash only |
| Lifetime | 15 minutes |
| Uses | Exactly one, consumed atomically |
| Device binding | `deviceNonce` generated by the SPA, held in `localStorage`, compared on callback |
| Rate limit | 3 per email per 15 minutes, 10 per IP, exponential backoff |
| Rate-limit store failure | Allow the request and log a warning without email/IP values. Unavailable stores bypass immediately; limiter commands time out after 1 second. Never report a store error as `rate_limited`. |
| Invalidation | Requesting a new link invalidates outstanding ones |

On nonce mismatch the link was opened elsewhere. Do not fail: require an explicit "yes, I opened this myself" and record it on the session. This is the difference between security and a support queue.

### Federated identity

Slice 1 ships OIDC with PKCE: Google, Microsoft Entra, and generic. SAML and SCIM are Slice 2.

**The verified email is the identity.** The same address through any route resolves to one `user_account`. An unverified email claim from a provider is refused outright and never links.

**Request-link always does the same work. It looks up the account and any pending invitation, then either enqueues mail or discards the result. Timing is equalised by doing the lookup regardless, not by adding a sleep. The response is 202 with an empty body in every case.

**Backoff after the IP limit is 1s, 2s, 4s, 8s, 16s, capped at 16, keyed on IP in Redis with a 15 minute window. The response is 429 with retryAfter in the envelope details. It is identical whether or not the address is known.

**Membership on invitation acceptance is written by the tenancy module, not identity. The callback resolves the exact invite_id attached to the token. Tenancy writes the membership, marks the invitation accepted and enqueues the relationship in one transaction, then awaits dispatch after commit. B-015 asserts the invitation is marked accepted and the intended role is granted.


Just-in-time provisioning happens only where a pending invitation exists. Domain capture is Slice 2.

## 3.3 Session

Opaque id in an `httpOnly`, `Secure`, `SameSite=Lax` cookie. No JWT, no claims in the cookie. Server state in Redis:

```ts
`session:${id}` -> SessionRecord    // see §1.7
```

Idle timeout 8 hours, absolute 30 days, rotation on privilege change. `method` is recorded and appears in the audit log.

**Redis is configured without persistence. ** A restart logs everyone out. That is acceptable and preferable: session state is the one thing safe to lose, and durability would mean a stolen session surviving an incident-response restart.

## 3.4 The authorization graph

SpiceDB, self-hosted in Slice 1. The schema holds companies, projects, human roles, and the binding from pools to sources. **Agents do not appear.**

```zed
definition user {}

definition company {
  relation admin: user
  relation member: user
  permission administer = admin
  permission view = admin + member
}

definition project {
  relation company: company
  relation admin: user
  relation operator: user
  relation viewer: user

  /* administration: anything that can widen what agents see */
  permission administer      = admin + company->administer
  permission set_entitlement = administer
  permission map_term        = administer
  permission bind_source     = administer
  permission view_unredacted = administer
  permission archive         = administer

  /* operations: keeping agents running WITHOUT widening what they see */
  permission export_evidence = operator + administer
  permission simulate        = operator + administer
  permission ack_observation = operator + administer

  permission view = viewer + operator + admin + company->view
}

definition pool {
  relation project: project
  permission administer = project->administer
  permission view       = project->view
}

definition datasource {
  relation project: project
  relation bound_pool: pool
  permission reachable  = bound_pool
  permission introspect = project->bind_source
  permission view       = project->view
}
```

**The operator role exists to separate running from widening.** An operator keeps agents working and exports evidence but cannot change what anything sees. If a permission ever appears on both sides of that line, the split is cosmetic and the review should say so.

**Pools bind to sources with the pool as the subject**, not with a subject relation to agents. Pools overlap on sources with different entitlements, so a boolean "can this agent read this source" would not say which pool authorised it, and the entitlement set could not be selected. Two checks, pool pinned by the key:

```ts
check(pool:harvest-ops,     'view',      user:dara)         // console
check(datasource:warehouse, 'reachable', pool:harvest-ops)  // request path
```

## 3.5 Route declarations

Every route declares its permission. A route without one fails to start the server, as a startup assertion rather than a review convention.

### The inventory

Every route in §2.5 carries one of these. Public routes declare `public` explicitly; the absence of a declaration is what fails, not the value.

| Route group | Permission |
|---|---|
| `/auth/*` except `me` and `sessions` | `public` |
| `/auth/me`, `/auth/sessions*` | `authenticated` |
| `POST /companies` | `authenticated` |
| `GET` / `PATCH /companies/:id` | `company#view` / `company#administer` |
| `POST /projects` | `company#administer` |
| `GET /projects/:id` | `project#view` |
| `PATCH /projects/:id` | `project#administer` |
| `POST /projects/:id/migrate-industry` | `project#administer` **and** `company#administer` |
| `/projects/:id/members`, `/invitations` | `project#view` read, `project#administer` write |
| `/projects/:id/permissions/*/explain` | `project#view` |
| `/projects/:id/sources`, `/sources/:id` | `project#view` read, `project#bind_source` write |
| `/sources/:id/introspect`, `/sampling-consent` | `project#bind_source` |
| `/projects/:id/elements`, `/elements/:id` | `project#view` read, `project#set_entitlement` write |
| `/pools/:id/entitlements*`, `/pattern-rules*` | `project#view` read, `project#set_entitlement` write |
| `/pools/:id/view-definition` | `project#administer` |
| `/projects/:id/pools`, `/pools/:id`, `/keys/*` | `project#view` read, `project#administer` write |
| `/pools/:id/agents*` | `project#view` |
| `POST /projects/:id/runs`, `/runs/:id/clarify` | `project#simulate` |
| `GET /projects/:id/runs`, `/runs/:id` | `project#view` |
| `/projects/:id/exports`, `/exports/:id` | `project#export_evidence` |
| `/projects/:id/stream`, `/runs/:id/stream` | `project#view` |
| `/projects/:id/vocabulary*` | `project#view` read, `project#map_term` write |
| `/industries*` | `authenticated` |
| `/admin/*` | `platform_admin`, never reachable from the customer API |

**The agent interface at `/mcp/v1/p/:projectId` is not in this table.** It authenticates by pool key rather than by session, and every authorization question there is answered against the pool.

**A tenant table is one whose rows belong to exactly one project**. The inventory is: data_source, introspection_run, catalog_object, catalog_element, element_stats, pool, pool_key, pool_source_binding, entitlement, pattern_rule, agent_presence, query_run, run_element, run_stage, synonym_candidate.

**Not tenant tables**, and therefore not covered: industry, vocabulary_term at industry scope, demo_source_template, user_account, user_identity, magic_link_token, user_session, mail_outbox, schema_migration, company_idp.

**term_synonym inherits its vocabulary_term's scope**, so it carries no project_id. Its own forced RLS policies consult the parent: reads require a visible term, tenant writes require a term in app.project_id, and platform-admin writes require an industry term. This also protects direct writes and reparenting. Dedicated integration tests cover it because project_id-based discovery cannot find it.

**opintel_app can INSERT, UPDATE and DELETE vocabulary_term, term_synonym and synonym_candidate**. RLS confines those writes to the current project. The vocabulary_term scope_target constraint separately enforces the valid industry/project column combination; it does not grant authority to write industry terms.

**vocabulary_term and embedding hold both industry-scope and project-scope rows.** The policy is: a row is visible when project_id = current_setting('app.project_id'), or when project_id is null, since a null project id means industry scope and industry data is shared by design.

**pending_invite is company-scoped**, not project-scoped, and is read before a project is chosen. It is excluded from RLS and protected by the route permission instead.



```ts
route.post('/pools/:id/entitlements/bulk', {
  permission: { resource: 'project', id: r => r.pool.projectId, permission: 'set_entitlement' },
  body: BulkEntitlementBody,
}, handler);
```

## 3.6 Defence in depth

Three independent layers. Any one of them alone is sufficient to deny.

1. **SpiceDB** at the API boundary, from a cached snapshot with a stored consistency token, failing closed
2. **Postgres row-level security**, with `app.project_id` and `app.user_id` set per request from the session
3. **Scope filters** injected into SQL before it reaches the sidecar, and enforced there

### Scope filters, specified

A scope filter is a predicate the API appends to the outermost query before dispatch, derived from the resolved plan rather than from anything the agent sent.

```ts
type ScopeFilter = {
  object: DuckDbName;        // the object it constrains
  predicate: string;         // parameterised, never interpolated from input
  params: readonly unknown[];
};
```

| Rule | |
|---|---|
| Derived from the plan, never from the request | An agent cannot influence its own scope |
| Appended at the outermost level, after the agent's own `WHERE` | It cannot be escaped by a subquery |
| Enforced again in the sidecar against the parsed statement | The API could be bypassed; the sidecar cannot |
| Recorded on the evidence record | A reviewer can see what constrained the query |

In Slice 1 the only scope filters are the pool's bound-source restriction and, for landed sources under `table_per_filing`, the filing restriction where a pool is scoped to one filing party. Row-level entitlements are not expressed this way: those are compiled into the view.

### The three database scopes

```ts
withTenant(ctx, fn)        // tenant data, RLS active, app.user_id and app.project_id set
withPlatform(fn)           // read industry and vocabulary at industry scope. No RLS bypass
withPlatformAdmin(fn)      // write industry scope. Distinct role, no customer route reaches it
```

`withPlatformAdmin` is used only by the platform administration surface and the promotion jobs. **No route in the customer-facing API calls it**, and a test asserts that by scanning the call graph.

## 3.7 Agent authentication

```
Authorization: Bearer opk_live_a3f2…
X-Opintel-Agent-Id: harvester-01     // optional, observational
```

The key is hashed and looked up. A valid key resolves to a pool. From that point every authorization question is answered against the pool, never the agent.

Keys are shown once at creation and stored only as a SHA-256 hash. Rotation creates a second key with a grace window; both are valid until the window closes, and the console shows migration progress computed from recent authentications.

---

# 4. Database schema

## 4.1 Conventions

- Postgres 16. `snake_case`. Tables singular
- Every table: `id uuid primary key default gen_random_uuid()`, `created_at timestamptz not null default now()`, `updated_at timestamptz` where mutable
- Foreign keys always, with an explicit `on delete` decision. No orphan cleanup jobs
- Every tenant table carries `project_id` denormalised, even when reachable through a join, because RLS predicates must not require one
- Timestamps are `timestamptz`. Never `timestamp`
- Money and ratios are `numeric`, never float
- Enums are Postgres enums when the set is closed and stable, otherwise `text` with a check constraint
- Migrations are forward-only in production and reversible in test. Both directions run in CI

## 4.2 Identity and tenancy

```sql
-- Declaration order matters: magic_link_token references pending_invite,
-- so pending_invite is created first.
create table user_account (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  full_name     text,
  avatar_url    text,
  timezone      text not null default 'UTC',
  created_at    timestamptz not null default now(),
  last_login_at timestamptz
);

create table user_identity (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references user_account(id) on delete cascade,
  provider         text not null,           -- magic_link | oidc:google | oidc:entra
  provider_subject text not null,
  email_verified   boolean not null,
  linked_at        timestamptz not null default now(),
  unique (provider, provider_subject)
);



create table company (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  default_industry_id uuid references industry(id),
  default_region    text not null,
  sso_enforced      boolean not null default false,
  idle_timeout_mins integer not null default 480,
  allowed_domains   text[] not null default '{}',
  created_at        timestamptz not null default now()
);

create table project (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references company(id) on delete restrict,
  industry_id uuid not null references industry(id) on delete restrict,
  name        text not null,
  region      text not null,                       -- immutable
  settings    jsonb not null default '{}',
  policy_version integer not null default 1,       -- bumped by any entitlement change
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (company_id, lower(name)),
  vocabulary_revision integer not null default 1
);

create table company_member (
  company_id uuid not null references company(id) on delete cascade,
  user_id    uuid not null references user_account(id) on delete cascade,
  role       text not null check (role in ('admin','member')),
  granted_at timestamptz not null default now(),
  granted_by uuid references user_account(id),
  primary key (company_id, user_id)
);

create table project_member (
  project_id uuid not null references project(id) on delete cascade,
  user_id    uuid not null references user_account(id) on delete cascade,
  role       text not null check (role in ('admin','operator','viewer')),
  granted_at timestamptz not null default now(),
  granted_by uuid references user_account(id),
  primary key (project_id, user_id)
);

create table relationship_outbox (
  id           bigint primary key generated always as identity,
  operation    text not null check (operation in ('touch','delete')),
  resource_type text not null,
  resource_id  text not null,
  relation     text not null,
  subject_type text not null,
  subject_id   text not null,
  created_at   timestamptz not null default now(),
  written_at   timestamptz,
  zed_token    text,
  attempts     integer not null default 0,
  last_error   text
);
create index on relationship_outbox (created_at) where written_at is null;

create table pending_invite (
  id         uuid primary key default gen_random_uuid(),
  email      citext not null,
  company_id uuid not null references company(id) on delete cascade,
  project_id uuid references project(id) on delete cascade,
  role       text not null check (role in ('admin','operator','viewer')),
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references user_account(id),
  created_at timestamptz not null default now()
);

create table magic_link_token (
  id           uuid primary key default gen_random_uuid(),
  email        citext not null,
  token_hash   bytea not null unique,
  device_nonce text not null,
  invite_id    uuid references pending_invite(id) on delete set null,
  expires_at   timestamptz not null,
  consumed_at  timestamptz,
  requested_ip inet,
  created_at   timestamptz not null default now()
);
create index on magic_link_token (email, created_at desc);
create index on magic_link_token (expires_at) where consumed_at is null;

create table company_idp (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references company(id) on delete cascade,
  provider      text not null,            -- 'oidc:google', 'oidc:entra', 'oidc:generic'
  display_name  text not null,            -- shown on the sign-in screen
  issuer        text not null,
  client_id     text not null,
  client_secret_ref text not null,        -- vault://... never a literal
  discovery_url text,                     -- null when issuer is well known
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (company_id, provider),
  constraint secret_is_reference check (client_secret_ref like 'vault://%')
);
```
**Platform defaults**. Google and Microsoft Entra are available to every company without configuration, using platform-level credentials. company_idp exists for a company bringing its own tenant or a generic OIDC issuer. So /auth/providers returns the platform defaults plus any enabled company_idp rows for the matching domain.

**sso_enforced without an enabled company_idp row is a misconfiguration** that would lock everyone out. Setting it refuses unless at least one provider is enabled.

**Membership is written in both places, and SpiceDB is authoritative for decisions**. Postgres holds the same facts so the application can list — which companies a user administers, who the members of a project are — without asking SpiceDB to enumerate. SpiceDB answers whether a user may do a thing; Postgres answers what exists.

**Both writes happen in one command**, the Postgres row inside the transaction and the SpiceDB relationship after it commits, through the outbox. A relationship written without its row, or the reverse, is a defect, and a reconciliation job reports any divergence.

**Neither table is tenant-scoped for RLS purposes**. project_member is read before a project is selected, and company_member has no project at all. Both are protected by route permissions.

**The pattern is the mail outbox's, applied to authorization**. The membership row and its outbox entry are written in one transaction; a dispatcher writes to SpiceDB after commit and records the returned ZedToken. A crash between them leaves an unwritten entry, which the dispatcher retries.

**Dispatch is in-process and immediate**, as magic link mail is. A membership that takes seconds to become effective is a support call, so the command awaits the write and reports failure to the caller rather than succeeding optimistically.

**The row is never deleted**, so relationship_outbox is also the audit trail of every authorization change until audit_entry arrives in item 5.10.

**Reconciliation** compares company_member and project_member against SpiceDB nightly and reports divergence. It does not repair automatically: a relationship present in one and not the other is a fault worth a human looking at.

## 4.3 Industry and vocabulary

Platform scope. Not tenant scoped, not covered by row-level security, readable by every authenticated user, writable only by the platform role.

```sql
create table industry (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  name               text not null,
  description        text,
  vocabulary_version integer not null default 1,
  active             boolean not null default true,
  created_at         timestamptz not null default now()
);

create table vocabulary_term (
  id            uuid primary key default gen_random_uuid(),
  scope         text not null check (scope in ('industry','project')),
  industry_id   uuid references industry(id) on delete cascade,
  project_id    uuid references project(id)  on delete cascade,
  kind          text not null check (kind in ('metric','subject','operation','parameter')),
  name          text not null,
  display_name  text not null,
  description   text,

  -- metric
  formula            text,
  required_columns   jsonb not null default '[]',
  assumption_columns jsonb not null default '[]',
  grain_rule         text check (grain_rule in ('sum','sum_over_sum','avg_of_ratio','none')),

  -- parameter
  param_type   text check (param_type in ('string','enum','integer','date','boolean')),
  enum_values  jsonb not null default '[]',
  column_hint  text,

  -- subject / operation
  aliases      jsonb not null default '[]',
  result_shape text,

  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,

  constraint scope_target check (
    (scope = 'industry' and industry_id is not null and project_id is null) or
    (scope = 'project'  and project_id  is not null and industry_id is null)
  ),
  constraint measure_needs_grain check (
    kind <> 'metric' or formula is null or grain_rule is not null
  )
);

-- canonical name is unique within a scope and kind, so a project term can shadow an
-- industry term of the same name without colliding with it
create unique index term_unique_industry on vocabulary_term (industry_id, kind, lower(name))
  where scope = 'industry' and active;
create unique index term_unique_project  on vocabulary_term (project_id, kind, lower(name))
  where scope = 'project' and active;

create table demo_source_template (
  id             uuid primary key default gen_random_uuid(),
  industry_id    uuid not null references industry(id) on delete cascade,
  name           text not null,
  kind           text not null check (kind in ('postgres','spreadsheet')),
  narrative      text,
  schema_spec    jsonb not null,      -- objects, elements, types, keys
  generator_spec jsonb not null,      -- seed, row counts, distributions, join keys
  pack_version   integer not null default 1,
  active         boolean not null default true,
  unique (industry_id, lower(name))
);

create table term_synonym (
  id         uuid primary key default gen_random_uuid(),
  term_id    uuid not null references vocabulary_term(id) on delete cascade,
  synonym    text not null,
  created_at timestamptz not null default now(),
  unique (term_id, lower(synonym))
);

create table synonym_candidate (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references project(id) on delete cascade,
  expression   text not null,
  resolved_term_id uuid references vocabulary_term(id) on delete set null,
  confidence   numeric(4,3),
  occurrences  integer not null default 1,
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now(),
  status       text not null default 'pending'
                 check (status in ('pending','accepted','rejected')),
  unique (project_id, lower(expression))
);
```

### The retrieval layer

Prompt mode recovers unknown metrics by similarity, so Slice 1 needs embeddings. They live in Postgres with pgvector rather than a separate vector store: the corpus is a few thousand vectors per industry, every search is filtered by industry and project first, and re-embedding must be transactional with the write that triggered it.

```sql
create table embedding (
  id           uuid primary key default gen_random_uuid(),
  owner_type   text not null check (owner_type in ('metric','term_synonym','prompt')),
  owner_id     uuid not null,
  scope_type   text not null check (scope_type in ('industry','project')),
  industry_id  uuid references industry(id) on delete cascade,
  project_id   uuid references project(id)  on delete cascade,
  content      text not null,            -- exactly what was embedded, kept for re-embedding and audit
  content_hash bytea not null,           -- skip re-embedding when unchanged
  model        text not null,
  dimensions   smallint not null,
  vector       vector(1536) not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (owner_type, owner_id, model)
);

create index embedding_metric_hnsw on embedding
  using hnsw (vector vector_cosine_ops) with (m = 16, ef_construction = 64)
  where owner_type = 'metric' and active;

create index embedding_scope on embedding (owner_type, scope_type, industry_id, project_id)
  where active;
```

**One table with partial indexes per owner type**, rather than a vector column on each owning table. A column per table means an index per table, inconsistent maintenance, and no single place to re-embed.

**Model changes are a backfill, not a migration.** `model` and `dimensions` are recorded per row, a retrieval filters to one model, and the active model flips per industry only when its backfill completes. Without this, changing embedding provider is an outage.

**A General industry is seeded alongside every vertical pack**. Slug general, name "General", described as "No industry vocabulary. Terms you define yourself."

**It has no terms**. Its inherited count is zero, and a project created against it starts with an empty vocabulary. That is the honest state for a business whose language Opintel does not yet know, and it is preferable to inheriting reinsurance terms into a logistics company.

**It is the fallback**, used when a company has no default_industry_id. It is also a legitimate choice: a customer can pick it deliberately and build their vocabulary from nothing, which is what a first customer in a new vertical does.

**It carries no demo pack**, so a general project has nothing to connect for evaluation. That is a reason to build the vertical pack before selling into a vertical, not a gap to fill with generic sample data.


## 4.3b Sources and catalog

```sql
create table data_source (
  id             uuid primary key default gen_random_uuid(),
  project_id     uuid not null references project(id) on delete cascade,
  kind           text not null check (kind in ('postgres','demo')),
  origin         text not null default 'customer' check (origin in ('customer','demo')),
  demo_template_id uuid references demo_source_template(id) on delete restrict,
  name           text not null,
  credential_ref text,                             -- required vault://... for every origin
  sampling_consent boolean not null default false,
  receives_landings boolean not null default false,
  landing_strategy text check (landing_strategy in ('append_as_at','table_per_filing')),
  first_landed_at timestamptz,
  status         text not null default 'pending',
  freshness_mode text not null default 'live',
  last_introspected_at timestamptz,
  created_at     timestamptz not null default now(),
  unique (project_id, lower(name)),
  constraint credential_matches_origin check (
    credential_ref is not null and credential_ref like 'vault://%' and
    (origin = 'customer' or (origin = 'demo' and demo_template_id is not null))
  ),
  duckdb_alias  text not null,        -- assigned once at creation, immutable
  unique (project_id, duckdb_alias),
);

create table introspection_run (
  include_schemas text[] not null default '{}', -- exact selection retained for retries
  diff       jsonb not null default '[]',     -- durable entries; type-family invalidation precedes metadata changes
  id         uuid primary key default gen_random_uuid(),
  source_id  uuid not null references data_source(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  state      text not null default 'queued',
  progress   jsonb not null default '{}',
  error      text,
  started_at timestamptz,
  ended_at   timestamptz,
  created_at timestamptz not null default now()
);

create table catalog_object (
  id          uuid primary key default gen_random_uuid(),
  source_id   uuid not null references data_source(id) on delete cascade,
  project_id  uuid not null references project(id) on delete cascade,
  schema_name text not null,
  object_name text not null,
  object_kind text not null check (object_kind in ('table','view','fileset')),
  duckdb_schema text not null,
  duckdb_name   text not null,
  name_revision integer not null default 0,
  lineage_known boolean not null default false,
  row_estimate  bigint,
  description   text,
  status        text not null default 'active',
  unique (source_id, schema_name, object_name)
);

create table catalog_element (
  id                uuid primary key default gen_random_uuid(),
  object_id         uuid not null references catalog_object(id) on delete cascade,
  project_id        uuid not null references project(id) on delete cascade,
  source_identifier text not null,
  duckdb_name       text,                   -- assigned once; null means unnameable
  name_revision     integer not null default 0, -- explicit adoption advances once
  stable_ref        text,                   -- attnum / field id where available
  source_type       text not null,
  duckdb_type       text,                   -- null means unsupported type
  nullable          boolean not null default true,
  is_key            boolean not null default false,
  description       text,
  status            text not null default 'active',
  discovered_at     timestamptz not null default now(),
  removed_at        timestamptz,
  unique (object_id, duckdb_name),
  unique (object_id, source_identifier)
);
create index on catalog_element (project_id, status);
create index on catalog_element (object_id) include (duckdb_name, duckdb_type);

create table element_stats (
  element_id  uuid primary key references catalog_element(id) on delete cascade,
  top_values  jsonb not null default '[]',   -- [{value, frequency}]
  cardinality bigint,
  null_rate   numeric(5,4),
  sampled_at  timestamptz
);

create table filing_party (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  code        text not null,                    -- '4471', the customer's own reference
  name        text not null,
  active      boolean not null default true,
  decimal_separator char(1) not null,
  date_format text not null,
  created_at  timestamptz not null default now(),
  unique (project_id, lower(code))
);

create table filing_party_rule (
  id          uuid primary key default gen_random_uuid(),
  party_id   uuid not null references filing_party(id) on delete cascade,
  project_id  uuid not null references project(id) on delete cascade,
  match_kind  text not null check (match_kind in ('filename_regex','folder')),
  pattern     text not null,
  kind        text check (kind is null or length(kind) > 0),
  period_group text,                            -- named capture yielding the period
  period_as_at_format text check (period_as_at_format in ('month_end','month_start','quarter_end','exact_date')),
  sheet       text,
  sheet_index integer,                          -- one-based, alternative to sheet
  header_row  integer not null default 1,
  verify_column text,
  verify_value text,
  priority    integer not null default 100,
  active      boolean not null default true
);
```
**The alias is assigned once at source creation** by normalising the source name per §4.4, with a numeric suffix on collision within the project. It never changes, for the same reason duckdb_name never changes: agents address it, and renaming it renames a catalog under running agents.

**A source name that normalises to nothing is refused at creation**, naming the rule. Unlike an element, a source with no alias cannot be addressed at all, so there is nothing to catalogue under it.

**The backfill migration aborts on any such name**, listing the affected source ids. An operator renames them and retries. Silently substituting a generated alias would give agents a name nobody chose and nobody can predict.

**SourceListItem includes `duckdbAlias: z.string()`**, the stored alias, alongside `name`. The catalogue source node uses that alias as its label. The console joins the source display name by source ID.

**Renaming a source changes its display name only**. The console shows both when they differ, so someone who renamed "Bordereaux Store" to "Cedant Filings" can see that agents still address bordereaux_store.

Item 3.6 persists the requested schema selection and the diff on `introspection_run`.
Only one queued or active run per source is allowed. Catalogue reconciliation is
staged in memory; the diff, all catalogue changes, source status and run completion
publish in one tenant transaction. A failed or cancelled read preserves the previous
catalogue. Cancellation is accepted only while queued, connecting or reading;
publication starts after the transition to diffing. Workers observe cancellation
through the persisted run state and abort the connector request.

A type-family diff carries the element identifier, before/after types and
`requiresEntitlementDeletion: true`. Item 4.1 supplies the deletion after this diff
is recorded. An unchanged structural snapshot yields an empty diff. Exact schema
subsets do not mark objects outside that selection removed.

Explicit `adoptRenamedNames` is recorded in run progress and requires project
administration at enqueue and again before publication. The default preserves
exposed names. Adoption uses the catalogue command, increments its name revision,
and records the breaking change in the same transaction.

Source connection failure sets status to `unreachable`; successful publication
sets it to `connected`. Item 3.6 exposes this status through its application service.
F-010 query-path refusal is implemented and verified in item 5.7.

**A demo source holds a real Vault reference to a real Postgres**. It is a database Opintel provisioned rather than one the customer owns, and that is the only difference. Making it credential-less would mean a second code path through introspection, and a demo that proves nothing about the product. The origin column says it is generated; nothing else does.


**Rules are established during the six-week deployment**, one set per filing party, and are data rather than code. A new filing party is a row, not a release.

**Two rules matching one file is a conflict, not a tie to break**. The file is quarantined naming both rules. Silently preferring the higher priority would attribute a bordereau by an ordering nobody reviewed.

**Zero rules matching is also a quarantine**. There is no fallback, no inference from the folder, and no guess from content. ING-08.

**Only filename and folder are matched in Slice 1**. Content-based identification reads the file, which is extraction, and belongs to 3.8 if it is ever needed.

**A filing is identified by (source_id, party_id, period, kind)**. A second file with the same tuple is a restatement. period is a text label from the rule's named capture, normalised to YYYY-MM where it parses as a month and kept verbatim otherwise — the customer's period labels are theirs, and reinterpreting them is how a March file becomes April.

**A byte-identical re-delivery is a duplicate, not a restatement**, detected by SHA-256 of the file. ING-06.

**Item 3.7 parses no file**. It streams the bytes to compute a SHA-256 for duplicate detection, which is an opaque read requiring no knowledge of the format. It does not open the spreadsheet, select a sheet, or read a cell. Interpretation of content is item 3.8. Identification is filename and folder only. ING-02's content inspection is deferred to 3.8 and marked.

The 3.7 sidecar watcher uses a deployment-provisioned tenant rule snapshot and
an atomic, durable local registration file per source. Ready registrations are
the handoff to 3.8; quarantine and duplicate registrations are never handed off.
No landing SQL or spreadsheet parsing runs in 3.7. Runtime configuration and
operational recovery are documented in `sidecar/README.md` under “Landing watch
and identify”. ING-07's landing assertions remain with 3.9.

**Formats: .xlsx and .csv only**. .xls is refused with a message naming the format, because the legacy binary format needs a different library and appears rarely in bordereaux. Quarantined, not silently skipped.

**Sheet selection is declared, not inferred**. filing_party_rule gains sheet text, matched by exact name, and sheet_index integer as an alternative. Exactly one must be set. A rule with neither is invalid, like one missing its period group. A named sheet that is absent quarantines the file.

**The header row is declared too**: header_row integer not null default 1. Inferring it means guessing which row of a spreadsheet is the header, and a wrong guess silently shifts every column by one.

**Data ends at the first fully empty row** after the header. Trailing notes below a blank row are excluded, which is the common bordereau shape. ING-13.

**Merged cells flatten by repeating the value** across the span for data cells. A merged header cell quarantines the file: it means the header is two rows, and the rule declared one.

**Formulas use their cached value**. A formula with no cached value quarantines the file, because evaluating it would mean implementing a spreadsheet engine and guessing at a value nobody computed.

**Declared per filing party, on the filing party row**: decimal_separator char(1) not null and date_format text not null. Not per rule, since a filing party's locale does not vary by file, and not per source, since one source receives many filing parties.

**Migration rollout.** Migration 018 adds locale and sheet-selection columns
nullable, preserving existing rows. Extraction refuses incomplete declarations.
Deployment owners must explicitly backfill them following
`docs/review/extraction-backfill.md`. A later migration, released only after that
backfill is verified, adds the locale NOT NULL and exactly-one-sheet constraints.
The NOT NULL declarations above describe the final schema, not the expand phase.

**No default, and no inference**. A filing party without a declared locale cannot have files landed. Inferring from the data is how 03/04/2026 becomes March in one file and April in the next.

**Content never attributes, only verifies**. Where filing_party_rule.verify_column and verify_value are set, extraction checks that column holds that value. A mismatch quarantines the file naming both the filename attribution and the content value.

**Runtime representation.** Extraction appends a summary to the existing customer-local arrival history and streams typed rows for item 3.9; it does not create a second filing register or a landing table. CSV is UTF-8 comma-delimited with quoting and uses sheet index 1. Supported date declarations are `DD/MM/YYYY`, `MM/DD/YYYY`, and `YYYY-MM-DD`; unsupported declarations refuse. Detailed parser conventions and resource limits are in `sidecar/README.md`.

**It cannot rescue a file quarantined by 3.7**. A file with no rule has no declared sheet, header row or locale, so there is nothing to read it with.


**Industry-neutral filing parties.** The platform uses `filing_party`,
`filing_party_rule`, `party_id`, `PartyId`, `FilingParty`, and `FilingPartyRule`.
`kind` is free, non-empty text; null may represent an incomplete identification
rule or an unattributed quarantine, never a landed filing. The industry pack
supplies meaningful kinds. The reinsurance vocabulary seeds subject
`filing_party` with display name `Cedant` and parameter `filing_kind` with
`premium`, `claims`, and `submission` values. These are industry data, not
platform validation rules.

Migration 020 renames existing application tables and keys in place; 021 seeds
that pack vocabulary. Historical migrations 017–019 remain unchanged. Customer
landing metadata upgrades `cedant_id` to `party_id` transactionally under the
landing advisory lock, preserving its primary-key index and all stored table
assignments. Watcher history upgrades from version 1 to version 2 without changing
arrival identities or restatement links. Deploy with a coordinated restart and
re-exported rule snapshots; see `sidecar/README.md` for the sequence.

### Landing

**as_at is the filing's period, not its receipt date**. A March bordereau delivered in April is March data. filing_party_rule gains period_as_at_format text, declaring how the period label parses to a date; where it is null the period is kept as a label and as_at is null. Receipt date is never used as as_at — it answers when a file arrived, which is a different question and already recorded.

**A landing table groups by** (source, filing party, kind). Named {party_code}_{kind}, lowercased and normalised by §4.4's rules, in a schema named for the source. Two filing parties' premium bordereaux never share a table: their columns differ, and merging them would mean reconciling schemas at write time.

**Provenance columns, prefixed _opintel_ and added to every landed row**: _opintel_filing_id uuid, _opintel_as_at date, _opintel_period text, _opintel_received_at timestamptz, _opintel_file_sha256 text.

**Atomic landing and recovery.** DDL, rows, column-type history and a commit receipt are committed together in customer Postgres. The source schema assignment and strategy lock persist there across restarts. A crash before saving local arrival state replays that receipt without inserting rows twice. The arrival history stores registration success or failure; item 3.10 reconciles this history with commit receipts and the application inbox, rather than adding another arrival authority. Per-filing table names use the assigned filing party/kind base (up to 30 characters), an underscore and the filing UUID without hyphens. Reserved `_opintel_` headers and headers that cannot fit PostgreSQL identifiers refuse rather than overwrite provenance or truncate names.

**A later filing adding a column** adds it to the table, nullable. Earlier rows keep null, which is honest: that filing party did not report it then.

**A later filing changing a column's type** does not alter the column. The filing is quarantined naming the column, both types, and the earlier filing that established it. Widening numeric to text to accommodate one bad file would silently change every historical value's meaning.

**The strategy is required only for sources that receive landed files**. data_source gains landing_strategy text and receives_landings boolean not null default false. A source with receives_landings true and no strategy is refused at connection. An ordinary Postgres source has neither.

**period_as_at_format accepts four values:**
| Value | Period label | as_at |
|-------|--------------|-------|
| month_end | 2026-03 | 2026-03-31 |
| month_start | 2026-03 | 2026-03-01 |
| quarter_end | 2026-Q1 | 2026-03-31 |
| exact_date | 2026-03-15 | 2026-03-15 |

**Month-end is the expected choice for bordereaux, but is never defaulted**, because a monthly bordereau reports the position as at the close of that month. Month-start exists because some filing parties label a filing by the period it opens, and that is their convention to state rather than ours to override.

**A period label that does not parse under the declared format quarantines the file**, naming the label and the format. There is no fallback to the receipt date and no inference from the label's shape.

**The value is declared per rule, not guessed**, for the same reason as the locale: 2026-03 means the 1st to one filing party and the 31st to another, and a wrong choice moves every number by a month without changing anything visible.


## 4.4 The exposed namespace and type mapping

The catalogue guard rejects ordinary updates to `duckdb_name` on objects and elements and to `duckdb_schema` on objects. Explicit adoption changes the name and increments `name_revision` by exactly one in the same update; advancing the revision without a name change is also rejected. This is an invariant guard, not an authorization check. Item 3.2 provides the explicit domain command and its breaking-change diff only; item 3.6 supplies administrator authorization and the persisted application path. No session flag bypasses the guard. Composite foreign keys include `project_id` so a tenant-scoped child cannot name another project's source or object. Exposed object names are unique within a source and DuckDB schema. The catalogue tables and filing-party identification tables in §4.3b have forced RLS; `element_stats` derives its scope through its parent element. Tenant roles have SELECT, INSERT, UPDATE and DELETE grants; platform scope has none. Platform administration has maintenance grants but remains subject to RLS.

Item 3.1's pure catalogue aggregate accepts assigned names for new identities and never invokes name assignment for an existing identity. It retains removed entities and emits identifier-only addition, rename and removal events. Item 3.2 supplies normalization and collision suffixes; later introspection work persists and publishes the changes. Entitlement preservation is verified against entitlement rows when item 4.1 introduces that table.

Agents address data by a DuckDB name, not a source name. The mapping is part of the contract: the agent writes it, `describe` returns it, and every evidence record carries both.

**A pool is a DuckDB session.** Only that pool's bound sources are attached, so the pool never appears in a name. Within the session the mapping is three-level:

| DuckDB | Source concept | Example |
|---|---|---|
| Catalog | Data source | `warehouse` |
| Schema | Source schema | `public`, `bdx` |
| Table (a view) | Table, view, or landed table | `treaty_risk` |

```
warehouse.public.orders        Postgres  warehouse / public.orders
bdx.public.treaty_risk         Postgres  bordereaux store, landed from spreadsheets
```

**Identifier normalisation.** Source identifiers may contain spaces, mixed case or characters DuckDB will not accept unquoted. Opintel normalises to lowercase snake case, and:

- The normalised name is **recorded on the element at first discovery and never recomputed**, so it cannot drift between introspection runs
- Collisions after normalisation get a numeric suffix and raise a diff entry, because a collision usually means two things that should not share a namespace
- The original identifier is always available in `describe` and on the evidence record



**Edge cases, in order of application:**
| Input | Result |
|---|---|
| Unicode letters | Transliterated to ASCII where a standard mapping exists, otherwise dropped. Größe becomes grosse |
| Punctuation and spaces | Collapsed to a single underscore, leading and trailing removed |
| Leading digit | Prefixed with n_. 123 Sales becomes n_123_sales |
| DuckDB reserved word | Suffixed with _col. select becomes select_col |
| Normalises to nothing | Refused. The element is catalogued with duckdb_name null and reported as unnameable, which is an administrator's problem to solve by renaming the source column or giving it an alias |
| Longer than 63 characters | Truncated to 57, then suffixed with _ and the first 5 hex characters of the SHA-256 of the original identifier, so two long names that share a prefix do not collide |

**Collision suffixes start at _2**. The first occupant keeps the unsuffixed name; the second becomes name_2. A collision raises a diff entry, because two source columns normalising to one name usually means they should not share a namespace.

**Every rule is applied at first discovery only**, and the result is stored, including a null result for an unnameable identifier. Changing a rule later does not rename anything already assigned. Explicit adoption is the deliberate exception. Collision suffixes reserve space within 63 characters, retaining the five-character hash for long identifiers. Removed elements continue to reserve their assigned names. Unicode transliteration is provided by a pinned local adapter; the naming and adoption domain do not depend on a connector.








**Source renames.** Where a rename is detected against a stable underlying identifier, the entitlement carries over but **the exposed DuckDB name does not change by default.** Changing it would break every agent referencing it. The console shows the divergence and an administrator can adopt the new name deliberately, which is a breaking change and is labelled as one.

**Nothing withheld or undecided appears in the namespace.** The view for a pool contains only entitled columns, so an undecided element is not addressable, not merely refused.

### Type mapping

`describe` returns DuckDB types, not source types, so the agent reasons about one type system regardless of where the data lives.

| Source family | DuckDB |
|---|---|
| Integer types | `TINYINT` to `BIGINT`, `HUGEINT` |
| Exact numeric, money | `DECIMAL(p,s)` |
| Float, double | `FLOAT`, `DOUBLE` |
| Text, varchar, clob | `VARCHAR` |
| Boolean | `BOOLEAN` |
| Date | `DATE` |
| Timestamp with or without zone | `TIMESTAMP`, `TIMESTAMPTZ` |
| UUID | `VARCHAR`, or `UUID` where well formed |
| JSON, JSONB | `JSON` |
| Array | `LIST(...)` |
| Struct, nested record | `STRUCT(...)` |
| Geometry, binary | Not exposed by default |

**Treatments constrain the mapping.** A tokenized column is always `VARCHAR` regardless of its source type, because a token is not an integer. `describe` reports the **post-treatment** type, since that is what the agent receives. Reporting the source type would make the agent write arithmetic against a token.

**Types with no clean equivalent** are catalogued but not exposed, and appear in the console as *unsupported type* rather than as undecided. Nobody needs to decide about something that cannot be released. A null catalog_element.duckdb_type records this state independently of entitlement. Type-mapping metadata takes precedence over entitlement state, so a tokenized treatment cannot expose an unsupported source type. Exact numeric and money mappings require representable precision and scale; nested arrays and structs require supported child types. The describe metadata helper returns post-treatment types; the agent endpoint and view compiler remain with their owning items.

## 4.5 Entitlements and pools

```sql
create table pool (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references project(id) on delete cascade,
  name        text not null,
  mode_query  boolean not null default true,
  mode_prompt boolean not null default true,
  clarification_policy text not null default 'pause'
    check (clarification_policy in ('pause','refuse')),
  budgets     jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (project_id, lower(name))
);

create table pool_key (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid not null references pool(id) on delete cascade,
  project_id  uuid not null references project(id) on delete cascade,
  key_hash    bytea not null unique,
  key_prefix  text not null,
  state       text not null check (state in ('current','retiring','revoked','expired')),
  grace_until timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid not null references user_account(id)
);
create unique index one_current_key_per_pool
  on pool_key (pool_id) where state = 'current';

create table pool_source_binding (
  pool_id    uuid not null references pool(id) on delete cascade,
  source_id  uuid not null references data_source(id) on delete cascade,
  project_id uuid not null references project(id) on delete cascade,
  bound_at   timestamptz not null default now(),
  primary key (pool_id, source_id)
);

-- the absence of a row IS "undecided". There is no 'undecided' value.
create table entitlement (
  pool_id     uuid not null references pool(id) on delete cascade,
  element_id  uuid not null references catalog_element(id) on delete cascade,
  project_id  uuid not null references project(id) on delete cascade,
  treatment   text not null check (treatment in
                ('clear','tokenized','masked','aggregate_only','withheld')),
  source_kind text not null check (source_kind in ('user','rule')),
  source_ref  text not null,                -- user id or rule id
  justification text,                        -- required for bulk -> clear
  set_at      timestamptz not null default now(),
  primary key (pool_id, element_id)
);
create index on entitlement (project_id, treatment);
create index on entitlement (element_id);

create table pattern_rule (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references project(id) on delete cascade,
  matcher    text not null,
  match_kind text not null check (match_kind in ('name_glob','type','schema')),
  treatment  text not null,
  priority   integer not null default 100,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table agent_presence (
  pool_id    uuid not null references pool(id) on delete cascade,
  agent_id   text not null,
  project_id uuid not null references project(id) on delete cascade,
  client     text,
  first_seen timestamptz not null default now(),
  last_seen  timestamptz not null default now(),
  reconnects integer not null default 0,
  state      text not null default 'connecting',
  primary key (pool_id, agent_id)
);
```

## 4.6 Evidence

Append-only and partitioned by month.

```sql
create table query_run (
  id            uuid not null default gen_random_uuid(),
  project_id    uuid not null,
  pool_id       uuid not null,
  agent_id      text,
  key_prefix    text not null,
  mode          text not null check (mode in ('query','prompt')),
  request       text not null,
  cil           jsonb,
  source_plan   jsonb,
  generated_sql text,
  row_count     integer,
  outcome       text not null,
  refusal_code  text,
  latency_ms    integer,
  versions      jsonb not null,
  freshness     jsonb not null default '{}',
  -- derived at write time from the sources actually reached, never from a project flag
  synthetic     boolean not null default false,
  started_at    timestamptz not null,
  completed_at  timestamptz,
  primary key (id, started_at)
) partition by range (started_at);

create table run_element (
  run_id     uuid not null,
  started_at timestamptz not null,
  element_id uuid,
  duckdb_name text not null,
  treatment  text not null,
  withheld_reason text
) partition by range (started_at);

create table run_stage (
  run_id     uuid not null,
  started_at timestamptz not null,
  stage      text not null,
  result     text not null,
  detail     jsonb,
  ms         integer
) partition by range (started_at);

create table audit_entry (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid,
  company_id  uuid,
  actor_id    uuid,
  actor_kind  text not null check (actor_kind in ('user','system','rule')),
  action      text not null,
  target      jsonb not null,
  before      jsonb,
  after       jsonb,
  revision    text,
  occurred_at timestamptz not null default now()
);
create index on audit_entry (project_id, occurred_at desc);
```

**The append-only guarantee is a grant, not a convention:**

```sql
revoke update, delete on query_run, run_element, run_stage, audit_entry from opintel_app;
grant  insert, select  on query_run, run_element, run_stage, audit_entry to opintel_app;
```

A test asserts this. If someone adds an `UPDATE` path, the grant fails it, not code review.

## 4.7 Row-level security

Enabled on every tenant table.

**The application never connects as the database owner**. Migrations run as opintel, which owns the schema. The application connects as opintel_app, opintel_platform and opintel_platform_admin, none of which own any table and none of which have BYPASSRLS. A test asserts that opintel_app is not a superuser and does not own the tenant tables, because a policy on a table its connection owns is decoration.

**Roles are created without login credentials**. The migration creates opintel_app, opintel_platform and opintel_platform_admin as NOLOGIN roles carrying only grants and RLS behaviour. They are not connection identities.

**The application connects once, as a login role, and assumes a role per scope**. One connection string, DATABASE_URL, using a login role that is a member of all three and owns nothing. Each scope begins with SET LOCAL ROLE, which is transaction-local exactly as the GUCs are, so it reverts on commit or rollback with no cleanup path:

SET LOCAL ROLE opintel_app;
SELECT set_config('app.user_id', $1, true), set_config('app.project_id', $2, true);

**This keeps one pool and one credential**. Three connection strings would mean three pools, three secrets to rotate, and a way to reach the wrong one. SET LOCAL ROLE gives the same isolation with none of that.

**Migrations connect as the owner**, using a separate MIGRATION_DATABASE_URL. In development both may point at opintel; in production they are different credentials and the application's cannot alter schema.

```sql
alter table catalog_element enable row level security;

create policy tenant_read on catalog_element for select
  using (project_id = current_setting('app.project_id', true)::uuid);

create policy tenant_write on catalog_element for all
  using      (project_id = current_setting('app.project_id', true)::uuid)
  with check (project_id = current_setting('app.project_id', true)::uuid);
```

The GUCs are set per request, inside the transaction, using `set_config(name, value, true)`. **The third argument makes them transaction-local, so they disappear on commit or rollback with no cleanup path to forget.** A session-scoped `SET` would survive connection release and a pooled connection could carry one tenant's identity into a later request. Tests RLS-03 and RLS-04 assert the setting is gone after both outcomes.

---

# 5. Frontend architecture

## 5.1 Structure

```
src/
  app/                  providers, router, error boundaries, composition root
  screens/<screen>/     one folder per console screen
    <Screen>.tsx        layout only, no data fetching
    components/         screen-local
    hooks/              screen-local, wrapping entity hooks
    store.ts            Zustand, UI state only, optional
  features/<feature>/   reusable across screens (trace-panel, treatment-picker)
  entities/<entity>/    schema.ts, keys.ts, queries.ts, mutations.ts
  shared/
    ui/                 design system primitives
    lib/                formatting, dates, cn()
    api/                generated client, SSE hook
```

**There is no `src/store`.** Server state lives in TanStack Query, which is the cache. UI state that dies on refresh lives beside its screen. There is no third category.

## 5.2 State rules

| Kind | Home | Example |
|---|---|---|
| Server data | TanStack Query | elements, pools, runs |
| Screen-local UI | Zustand beside the screen | tree expansion, selection, filters |
| Form | React Hook Form + Zod | connect source wizard |
| URL | TanStack Router search params | active filter, selected element |

Anything a user would expect to survive a page share goes in the URL, not in Zustand.

## 5.3 The entity layer

Slice 1 entities, grouped by scope because scope determines cache policy.

**Platform scope**, shared across every project, read-mostly, long cache:
`industry`, `industryTerm`, `demoSourceTemplate`, `discoveryQuestion`

**Project scope**:
`user`, `company`, `project`, `member`, `invite`, `session`, `dataSource`, `introspectionRun`, `catalogElement`, `entitlement`, `patternRule`, `pool`, `agent`, `effectiveVocabulary`, `synonymCandidate`, `run`, `runStage`

Platform keys begin `['industry', industryId, …]` and therefore survive a project switch. Project keys begin `['project', projectId, …]` and do not.

Every entity has a key factory. Hand-written key arrays are blocked by lint.

```ts
export const elementKeys = {
  all:    (p: ProjectId) => ['project', p, 'element'] as const,
  lists:  (p: ProjectId) => [...elementKeys.all(p), 'list'] as const,
  list:   (p: ProjectId, f: ElementFilter) => [...elementKeys.lists(p), f] as const,
  detail: (p: ProjectId, id: ElementId) => [...elementKeys.all(p), 'detail', id] as const,
};
```

Every project-scoped key begins `['project', projectId, …]`, so switching project invalidates everything scoped to the old one by prefix removal rather than 15 explicit calls.

### Cache policy

| Entity | Stale time | Notes |
|---|---|---|
| `catalogElement` | 5 min | Large. Fetched by prefix, never wholesale |
| `entitlement` | 1 min | Changes often, drives the view |
| `pool`, `dataSource` | 1 min | |
| `agent` | realtime | Written by SSE, not polled |
| `introspectionRun` | 5 s while active | Stops polling on terminal state |
| `industry`, `industryTerm`, `demoSourceTemplate`, `discoveryQuestion` | 1 hour | Shared, changes only on a platform publish |
| `effectiveVocabulary` | 5 min | Keyed by `(projectId, vocabularyVersion)` |
| `synonymCandidate` | 1 min | A queue, changes as prompts arrive |
| `run`, `runStage` | **Infinite** | Immutable once written. Never refetched |

Immutable entities caching forever is the largest single cache win in the application.

### Invalidation matrix

| Mutation | Invalidates |
|---|---|
| Set entitlement | `entitlement.detail`, `pool.detail`, `catalogElement.lists`, `project.stats` |
| Bulk set | `entitlement.all`, `pool.lists`, `catalogElement.lists`, `project.stats` |
| Connect source | `dataSource.lists`, `project.stats` |
| Retry source / resume demo | `dataSource.lists`, `project.stats` |
| Introspection completes | `catalogElement.all`, `dataSource.detail`, `entitlement.all` |
| Delete source | `dataSource.lists`, `catalogElement.all`, `entitlement.all`, `pool.lists` |
| Create pool | `pool.lists`, `project.stats` |
| Rotate key | `pool.detail` only |
| Bind source | `pool.detail`, `entitlement.all` for that pool |
| Accept invite | `member.lists`, `project.lists`, `auth.me` |
| Change role | `member.lists`, `auth.me` if self |
| Add or edit a project term | `effectiveVocabulary`, `industryTerm` untouched |
| Accept a synonym candidate | `synonymCandidate.lists`, `effectiveVocabulary` |
| Publish an industry pack (platform) | `industry`, and `effectiveVocabulary` for **every project in that industry**, by version bump rather than enumeration |
| Migrate a project's industry | `effectiveVocabulary`, `project.detail`. **Never `entitlement`** |
| Create company | company.lists, auth.me |
| Create project | project.lists, company.lists |
| Rename project | project.lists, project.detail |
| Cancel introspection | `introspection.detail`, `introspection.list`, `source.list` |
A mutation not in this table is incomplete.

### Optimistic updates

Permitted where the outcome is deterministic and rollback is harmless: setting an entitlement, toggling a setting, editing a description.

**Forbidden** where the action is irreversible or the server may refuse on grounds the client cannot evaluate: key rotation, key revocation, source deletion, member removal. These show a pending state and wait.

## 5.4 SSE into the cache

One stream hook at the project layout. High-frequency deltas write directly; structural changes invalidate.

```ts
useProjectStream(projectId, {
  'agent.presence':   d => qc.setQueryData(poolKeys.agents(projectId, d.poolId), upsert(d)),
  'catalog.changed':  () => qc.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
  'run.created':      d => qc.setQueryData(runKeys.detail(projectId, d.id), d),
});
```

Writing directly for everything causes divergence. Invalidating for everything causes a request storm.

## 5.5 Screen contract

```ts
type ScreenState<T> =
  | { status: 'loading' }
  | { status: 'empty' }
  | { status: 'error'; error: AppError; retry: () => void }
  | { status: 'ready'; data: T };
```

Rendering an empty table with no explanation is a defect. Every screen has a purposeful empty state naming the next action.

## 5.6 Slice 1 screens

Sign in, check email, auth callback, confirm device, accept invitation, project chooser, create project (industry picker), dashboard, workbench, vocabulary (with readiness), synonym candidates, discovery coverage, data sources, source detail, introspection run, entitlements, pools, pool detail, agent twin, activity, run detail, access, project settings (details, discovery, query, evidence, access), personal settings, kitchen sink.

Deferred to Slice 3: releases, source of truth, relationships, knowledge, audit log, and the **observations register** as a workflow surface with state.

**The Dashboard is in Slice 1a**, as item 5.15. It shows the decided ratio, the treatment spectrum, counts, the needs-a-decision feed and the pool shields. Findings surface inline in that feed rather than in a register with acknowledge and resolve states, which is what Slice 3 adds.

Quarantined filings appear in the dashboard feed for the same reason: they need a decision and they belong to no source.

**There is no Playground screen.** Connecting a demo source is an option in the connect-a-source flow, presented alongside the customer database options with its narrative. The guided first-run checklist lives on the dashboard's empty state, where it belongs, and disappears once the project has a source and a pool.

## 5.7 Design system

Tokens are the only source of colour, type, spacing and motion. Raw hex or an arbitrary Tailwind value in a component fails lint.

```css
--plum:#1B0232; --green:#0CC655; --yellow:#FFF730;
--bg:#F2EFF6; --surface:#FFF; --rule:#E1DAEA;
--ink:#1B0232; --ink-2:#5A4A6B; --ink-3:#675878;
--t-clear:#0CC655; --t-token:#1F6FD0; --t-mask:#B8940A;
--t-agg:#7A3FA8;  --t-held:#C2334D;  --t-unset:#FFF730;
```

**Three rules enforced in review:**

- **Yellow means "this needs a decision from you" and nothing else.** Not errors. Nothing is broken when Opintel is holding data back as designed
- **Monospace for every machine artifact:** SQL, identifiers, keys, row counts, timestamps. Prose in the body face. The separation is the product's argument made visible
- **No scores.** Facts about configuration, never grades

Fonts are self-hosted and subset. No third-party font CDN on a security product.

All CSS is scoped under a root id so the application cannot collide with a host page.

Accessibility is WCAG 2.2 AA: keyboard operable throughout, visible focus, `prefers-reduced-motion` respected, and **state never conveyed by colour alone**, so every treatment badge carries a text label.

**The four auth screens have no counterpart in the reference implementation**, which is the signed-in console. They are composed from existing primitives on the plum background: a centred `.card` at most 420px wide, the Opintel mark above it, a `.fld` for the email, `.btn go` for the primary action, `.btn ghost` for each provider, and `.note` for secondary text. No new classes. If a needed class genuinely does not exist, stop and say which.

**Create project has no counterpart in the reference implementation**, which shows an already-created project. Compose it from existing primitives: a .card containing .fld for the name, a list of industries each showing its inherited term count, and a region selector. The industry choice is presented as a decision with consequences, not a dropdown.
---

# 6. Error handling

### The Tailwind theme mapping

Referenced by the header of `opintel-master.css`. The stylesheet is the source of truth; this maps its tokens into Tailwind so utilities never introduce a value the stylesheet does not define.

```css
@theme {
  --color-plum: var(--plum);            --color-plum-2: var(--plum-2);
  --color-green: var(--green);          --color-green-dk: var(--green-dk);
  --color-green-bg: var(--green-bg);
  --color-yellow: var(--yellow);        --color-yellow-br: var(--yellow-br);
  --color-yellow-bg: var(--yellow-bg);

  --color-bg: var(--bg);                --color-surface: var(--surface);
  --color-surface-2: var(--surface-2);  --color-surface-3: var(--surface-3);
  --color-ink: var(--ink);              --color-ink-2: var(--ink-2);
  --color-ink-3: var(--ink-3);
  --color-rule: var(--rule);            --color-rule-2: var(--rule-2);

  /* treatments, each a trio */
  --color-token: var(--token);   --color-token-bg: var(--token-bg);   --color-token-dk: var(--token-dk);
  --color-mask: var(--mask);     --color-mask-bg: var(--mask-bg);     --color-mask-dk: var(--mask-dk);
  --color-agg: var(--agg);       --color-agg-bg: var(--agg-bg);       --color-agg-dk: var(--agg-dk);
  --color-held: var(--held);     --color-held-bg: var(--held-bg);     --color-held-dk: var(--held-dk);

  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, monospace;

  --breakpoint-sm: 640px;
  --breakpoint-md: 820px;     /* the drawer collapses below this */
  --breakpoint-lg: 1100px;
  --breakpoint-xl: 1400px;
}
```

**Two rules.** Tailwind may only reference these names, never a literal. And where a component has a class in `opintel-master.css`, that class is used rather than a utility stack that reproduces it: the stylesheet owns appearance, Tailwind handles layout the stylesheet does not cover.

**Dark mode is off.** Do not add a variant for later; it doubles every review.

## 6.1 Taxonomy

Four kinds, handled differently. Confusing them is the usual cause of unhelpful error messages.

| Kind | Meaning | HTTP | Retryable | Alerts |
|---|---|---|---|---|
| **Invariant violation** | A domain rule was broken. A bug | 500 | No | Yes, page |
| **Refusal** | The system worked correctly and declined | 403 / 409 / 422 | No | No |
| **Input error** | The caller sent something invalid | 400 | No | No |
| **Infrastructure failure** | A dependency failed | 502 / 503 | Yes | Yes, if sustained |

**A refusal is not a failure.** An entitlement refusal, an unmapped term, a cardinality block are the product working. They are recorded, surfaced, and never alerted on. Alerting on refusals produces noise that trains people to ignore alerts.

## 6.2 Result, not exceptions

Domain and application layers return `Result<T, DomainError>`. Exceptions are reserved for genuinely exceptional infrastructure failure.

```ts
type Result<T, E = DomainError> =
  | { ok: true;  value: T }
  | { ok: false; error: E };

class DomainError {
  constructor(
    readonly code: ErrorCode,
    readonly message: string,      // user-facing, written for a human
    readonly details?: JsonObject,
    readonly retryable = false,
  ) {}
}
```

Every branch of a `Result` is covered by a test. That is the point of the type.

## 6.3 Codes

Stable, machine-readable, and part of the public contract. Renaming one is a breaking change.

**Console**

`unauthenticated` · `forbidden` · `not_found` · `validation_failed` · `conflict` · `idempotency_key_reused` · `rate_limited` · `dependency_unavailable`

**Agent-facing**, which matter more because a model consumes them:

| Code | Agent should |
|---|---|
| `entitlement_missing` | Report the gap upward. Do not retry |
| `element_withheld` | Report. Do not retry |
| `term_unresolved` | Name the term. Rephrase or escalate |
| `clarification_required` | Answer through `respond_clarification` |
| `sources_cannot_be_joined` | Report. Needs an administrator |
| `large_result_confirmation` | Confirm or narrow |
| `budget_exceeded` | Back off, retry later |
| `source_unavailable` | Retry with backoff |
| `sql_not_permitted` | Rewrite. Do not retry unchanged |
| `unsupported_pushdown` | Simplify or narrow the scan |
| `rate_limited` | Back off per `retryAfter` |

## 6.4 Message rules

The `message` field is written for a person and appears in the UI unchanged.

- State what happened and what to do
- Name the specific object: `warehouse.public.orders.tax_id`, not "a field"
- Never a stack trace, a SQL fragment, or an internal id the reader cannot act on
- Never apologise, never blame the user

Good: *"tax_id has no entitlement for Harvest Ops. Set one in Entitlements, or the agent will keep being refused."*
Bad: *"Error: forbidden."*

## 6.5 Boundaries

**Backend.** One error middleware maps `DomainError` to the envelope. An uncaught exception becomes a 500 with a generic message, a logged stack, and a `requestId` the user can quote. The internal message never reaches the client.

**Frontend.** An error boundary per route renders `ErrorState` with what failed and a retry. A boundary never renders a blank page. Query errors surface in the screen's error state; mutation errors surface as a toast naming what failed, with the optimistic change rolled back.

**Agent.** Errors arrive as a normal MCP result with `isError: true` and the code in `_meta`, plus the human-readable reason **in the text content**, for the same reason reduction is in the text content.

## 6.6 Fail closed

If Opintel cannot determine an entitlement, it refuses. If a source is unreachable, it refuses rather than answering from stale data. If the authorization cache is beyond its staleness ceiling, it refuses.

Every refusal is recorded with its reason. A refusal with no record is a defect, because the customer's question afterwards is "what happened", and silence is not an answer.

---

# 7. Testing strategy

## 7.1 Levels

| Level | Tool | Rule |
|---|---|---|
| Domain unit | Vitest | Every invariant. No mocks, the domain has no dependencies |
| Use case | Vitest | Ports stubbed. Every `Result` branch |
| Integration | Vitest + Testcontainers | Real Postgres, Redis, SpiceDB. **No mocked persistence** |
| Contract | Pact | MCP tool schemas and the sidecar, both directions |
| Component | Testing Library | Every screen renders all four states |
| E2E | Playwright | The tranche's exit criteria, verbatim |
| Visual | Playwright screenshots | Every screen at 390 / 900 / 1440 |
| Accessibility | axe-core in Playwright | Zero violations, gates the build |
| Load | k6 | The performance budgets |

## 7.2 Fixtures

One seeded project, deterministic, shared by every test and by evaluation: **Far East Treaty Book**, Kuwait Re, connected to the Reinsurance demo pack. That pack is **twelve cedant spreadsheets in inconsistent formats landing into a demo Postgres**, plus one customer Postgres source. 2,140 elements, four pools, sixty-one elements deliberately undecided.

**The demo pack is the same artifact a customer connects**, so the fixture exercises the ingest path rather than sidestepping it, and a bug in it is a bug in the product.

Tests that mutate run in a transaction rolled back at teardown, or against a per-worker database. A test that depends on another test's leftovers is a defect.

Integration tests use `TEST_DATABASE_URL`, never the development `DATABASE_URL`. When `TEST_DATABASE_URL` is absent, the test runner derives it from `DATABASE_URL` by appending `_test` to the database name; migrations run against that isolated database before the suite.

## 7.3 What Slice 1 must prove

The pilot criteria are the acceptance tests. Each is automated.

| # | Criterion | Test |
|---|---|---|
| S1 | For any request, show which fields were received and in what form | Pick five random runs, produce the full record for each in under a minute |
| S2 | A field added mid-pilot is unreadable until someone decides | Add a column, assert it appears in no agent response |
| S3 | The same restriction holds in SQL and in prompt | Request a withheld element both ways, both refused, both recorded |
| S4 | The customer's own agent connects without vendor code | Configure from the published documentation only |
| S5 | Entitlement decisions took a tolerable amount of effort | Manual, sponsor judgement, recorded in writing |

## 7.4 The tests that matter most

**The bypass suite.** Ten named tests that agent SQL cannot reach a base catalog: fully qualified reference, withheld column via the base catalog, `duckdb_tables()`, `information_schema`, `duckdb_views()`, reference inside a CTE, inside a prepared statement, quoted or case-varied identifier, `ATTACH` of an attached source, `search_path` manipulation. A newly discovered bypass is added in the same pull request as its fix.

**The ephemerality test.** Run a query returning 100k rows of sentinel values, then scan the container filesystem and mapped memory. Zero matches, or the slice fails. "We do not persist anything" is unverifiable. This is verifiable.

**The append-only test.** Assert the application role cannot `UPDATE` or `DELETE` evidence, at the grant level rather than by trying and catching.

**The tokenization test.** The same input produces the same token in two different sources, so a cross-source join holds without either releasing the real identifier.

**The inheritance tests.** A new project answers a question on its first day using inherited terms alone. Inheritance is by reference, so no vocabulary rows are copied at creation and the row count is unchanged. Republishing an industry pack reaches an existing project without a migration. A project term shadows an inherited one of the same name, and both rows still exist.

**The migration test.** Changing a project's industry leaves **every entitlement untouched**, asserted row by row. Industry governs language, not access, and this is the assertion that keeps it true.

**The grain rule test.** A metric whose formula aggregates and which has no grain rule refuses composition rather than warning. A warning on a wrong number is not a fix.

**The demo source tests.** A demo source connects, introspects and catalogues through exactly the same code path as a Postgres source, asserted by spying on the connector port rather than by inspecting output. A project holds a demo source and a customer source at once and queries across both. A run touching a demo source is marked synthetic from the sources it reached, and a run touching only customer sources is not. Synthetic runs never appear in an export. Deleting a demo source is the ordinary source deletion, with no special path.

**The determinism test.** The same prompt with the same vocabulary version produces identical classification across ten runs.

## 7.5 Coverage

Traceability, not percentage. Every normative statement in this document maps to at least one test id. The matrix is generated from test annotations at CI time and compared against the entity, screen and endpoint inventories. **Any inventory item with zero tests fails the build.**

---

# 8. Observability

## 8.1 Principle

Opintel sits in the request path of someone else's agents and fails closed. When it is slow or refusing, their agents are slow or refusing. Observability is therefore an availability requirement, not a nicety.

**One rule governs everything below: no customer data in telemetry.** Not in span attributes, not in log fields, not in metric labels. Row values, prompt text and SQL literals are never emitted. Field names and identifiers are, because they are metadata and they are what makes a trace useful.

## 8.2 Traces

OpenTelemetry. One trace per request, propagated into the sidecar.

```
opintel.request                       [pool, project, mode, outcome]
  auth.verify_key
  authz.check                         [cached, snapshot_age_ms]
  pipeline.classify                   [model, tokens, confidence]
  pipeline.resolve_values             [params, clarified]
  pipeline.resolve_sources            [concepts, registry_hits]
  pipeline.compose
  pipeline.qqc                        [l1, l2, l3]
  sidecar.execute                     [sources, rows_scanned, rows_returned, memory_peak_mb]
    sidecar.attach[source]
    sidecar.apply_views
    sidecar.scan[source]              [pushdown]
  evidence.write
```

Span naming is `<context>.<operation>`. Attribute keys are `snake_case` and drawn from a published allowlist. An attribute not on the allowlist is dropped by the exporter, so a well-meaning addition cannot leak a value.

Sampling: 100% of errors and refusals, 100% of prompt-mode runs in Slice 1 because volume is low and the traces are the product, 10% of query mode above 100 requests per minute.

## 8.3 Metrics

Low cardinality by construction. **Never label by element, agent, user or run id.**

| Metric | Type | Labels |
|---|---|---|
| `opintel_requests_total` | counter | project, pool, mode, outcome |
| `opintel_request_duration_ms` | histogram | mode, lane |
| `opintel_refusals_total` | counter | code |
| `opintel_elements_undecided` | gauge | project |
| `opintel_clear_ratio` | gauge | project, pool |
| `opintel_agents_connected` | gauge | project, state |
| `opintel_authz_check_ms` | histogram | cached |
| `opintel_authz_snapshot_age_ms` | gauge | |
| `opintel_sidecar_health` | gauge | project, sidecar |
| `opintel_introspection_duration_ms` | histogram | source_kind |
| `opintel_llm_tokens_total` | counter | project, call_site |
| `opintel_evidence_write_lag_ms` | histogram | |

`opintel_elements_undecided` and `opintel_clear_ratio` are business metrics that happen to be operational: a sudden drop in undecided means a bulk decision, and a sudden rise in clear ratio means someone widened access. Both are worth seeing.

## 8.4 Logs

Structured JSON, one line per event, with `requestId`, `projectId`, `poolId` and `traceId` on every line. Field allowlist enforced by the logger, not by developer discipline.

| Level | Use |
|---|---|
| `error` | Invariant violations and infrastructure failures only |
| `warn` | Degraded mode, circuit open, retry exhausted |
| `info` | Lifecycle: request start and end, introspection state changes, key rotation |
| `debug` | Off in production, per-request enablement by header for support |

**Refusals log at `info`**, not `warn`. They are normal operation.

## 8.5 Dashboards

Three, and no more, because a dashboard nobody reads is worse than none. **These are operational dashboards for the team running Opintel**, not the product's Dashboard screen, which is a different thing in a different place.

**Service health.** Request rate, error rate, p50/p95/p99 by mode, authorization check latency, sidecar fleet health, evidence write lag.

**Customer health, per project.** Undecided count, clear ratio, refusals by code, agents connected against expected, introspection freshness. This is the view a customer success conversation runs from.

**Cost.** LLM tokens and embedding calls per project per day, with a projection against plan ceilings.

## 8.6 Alerts

Page only on customer impact.

| Alert | Condition | Severity |
|---|---|---|
| Availability | Error rate above 2% for 5 minutes | Page |
| Authorization unavailable | SpiceDB unreachable beyond the staleness ceiling | Page |
| Sidecar fleet down | All sidecars for a project unhealthy for 2 minutes | Page |
| Evidence write failing | Write lag above 30 seconds | Page. **A request we cannot record is a request we should not serve** |
| Latency | p95 above budget for 15 minutes | Ticket |
| Introspection failing | Same source failing three runs | Ticket |
| Cost | Project above 80% of ceiling | Ticket |

**Not alerted:** refusals of any kind, undecided elements, agents going stale. These are product signals and appear in the console.

---

# 9. CI/CD

## 9.1 Pipeline

Every pull request, in order, failing fast:

```
1. install, cache
2. typecheck            tsc --noEmit, strict, noUncheckedIndexedAccess
3. lint                 eslint, boundary rules, no raw hex, no arbitrary tailwind values
4. unit                 vitest, domain and use cases
5. migrations           up and down against a fresh database
6. integration          testcontainers: postgres, redis, spicedb
7. contract             pact verification, MCP and sidecar
8. build                vite build, bundle budget check
9. component + a11y     testing-library, axe
10. e2e                 playwright against a composed stack
11. visual              screenshot comparison, three viewports
12. traceability        generate the matrix, fail on any uncovered inventory item
```

Steps 1 to 5 must finish inside five minutes. If they do not, the team stops merging and fixes the pipeline, because a slow gate is a gate people route around.

## 9.2 Environments

| Environment | Purpose | Data |
|---|---|---|
| `local` | Development. Docker Compose | Seeded fixture |
| `preview` | One per pull request, torn down on merge | Seeded fixture |
| `staging` | Release candidate, production shaped | Synthetic only. **Never customer data** |
| `production` | | |

Staging holds no customer data at all, so a staging incident is never a customer incident, and engineers can be given access without a review.

## 9.3 Migrations

Forward-only in production, reversible in test, and both directions run in CI.

**Expand and contract for anything breaking.** Add the new column, backfill, dual-write, switch reads, remove the old column in a later release. A migration that renames or drops in one step is rejected in review.

Long-running backfills run as jobs, not migrations, so a deploy is never blocked behind a table rewrite.

Every migration is checked for a lock that would block writes on a large table. `ALTER TABLE ... ADD COLUMN` with a default is fine on Postgres 16; adding a constraint is not, and must be `NOT VALID` then validated separately.

## 9.4 Deployment

Rolling, with a health gate. The new version must answer `/healthz` and pass a smoke test against a real seeded project before the old version drains.

**Backward compatibility for one version.** The API and the agent interface must serve the previous release's clients, because a customer's agents are not redeployed when Opintel is.

Rollback is a redeploy of the previous image, and it is tested every release rather than assumed. A rollback that has never been run is a hope.

## 9.5 Feature flags

Per project, evaluated server side, defaulting off.

`prompt_mode` · `value_sampling` · `demo_sources` · `spreadsheet_ingest` · `oidc_<provider>`

Flags are for enabling work in progress and for per-customer rollout. They are removed within two releases of full rollout, and a stale flag is a lint failure after 60 days.

## 9.6 The sidecar

Built and released separately, versioned independently, and **never auto-upgraded**. A customer running it in their own network upgrades on their schedule.

The API declares a minimum sidecar version and refuses to dispatch below it, with a clear message naming the required version rather than a protocol error.

---

# 10. Security requirements

## 10.1 What we are defending

| Asset | Threat | Primary control |
|---|---|---|
| Customer data in the source | An agent reads what it should not | Per-field entitlements compiled into per-pool views; undecided is absent from the namespace |
| Customer data in flight | Interception | TLS 1.3 everywhere, including to the sidecar |
| Customer data at rest, in Opintel | There is none | Opintel persists no customer rows. The query path holds results in memory and releases them after the response |
| Customer data at rest, in the customer's environment | Landed spreadsheets are written to the customer's own Postgres | This is a copy, and it is theirs. It is made by software they run, inside their network, from a file they already had. **Opintel never receives the file** |
| Source credentials | Theft | Vault references only. A literal in the database fails a constraint |
| Pool keys | Leak or misplacement | Hashed at rest, shown once, rotatable with a grace window, narrow pools bound to few sources |
| Evidence | Tampering | Append-only enforced by grant, not convention |
| The authorization graph | Privilege escalation | Route-level declarations, startup assertion, RLS and scope filters behind it |
| Cross-tenant | Leakage | Project id in every key, RLS on every table, GUC cleared on connection release |
| The industry pack, vocabulary and demo templates | A customer writing to shared platform data | Industry-scope rows are writable only by the platform role. There is no customer route that reaches them, and a check constraint keeps project terms in project scope |
| Retrieval | A project retrieving another project's embeddings | Every search filters by industry and project before ranking. Asserted on the filter, not on the result |

## 10.2 The pool key

The most likely thing to leak, because it is pasted into agent configuration by hand.

**Blast radius is bounded by design, not by vigilance.** Whatever holds a key sees exactly what that pool is entitled to see. Which makes pool narrowness the control, and makes the clear ratio on each pool a blast-radius reading rather than a statistic.

Slice 1 accepts that a leaked key grants that pool's access. Enrolment tokens and platform attestation, which would remove the shared secret from the runtime path, are not in scope and are stated to customers as such.

## 10.3 The query engine

The controls that make the entitlement model real rather than nominal.

- Base catalogs are **not addressable** by agent SQL. Views are materialised in a session with no attachments, and the ten-case bypass suite proves it
- Hardening is applied then locked, with `lock_configuration` as the **final** statement. Without it an agent can undo everything above it
- External access, extension loading and file readers are disabled
- No disk spill. Exceeding memory fails rather than writes
- Read-only source connections, opened per execution and closed after
- Statement timeout and row cap on every execution
- Per-pool concurrency ceiling, queued to a bound then refused

## 10.4 Application security

- CSP with no `unsafe-inline` and no third-party origins. Fonts and scripts self-hosted
- Session cookie `httpOnly`, `Secure`, `SameSite=Lax`, opaque, server-side state
- CSRF: `SameSite=Lax` plus an origin check on every state-changing request
- Every input validated by Zod at the boundary. Nothing trusts a client-supplied identifier without an authorization check on it
- Parameterised queries only. The one place SQL is constructed is the view compiler, which builds from a validated catalog rather than user input
- Rate limits per session, per key, per IP, and per project
- Dependencies: lockfile committed, `npm audit` gates the build, automated updates reviewed weekly

## 10.5 Secrets

Vault or a cloud secret manager. Nothing in environment files in the repository, nothing in the image.

Source credentials are stored as references and resolved by the sidecar at execution time. **In VNet and on-premises mode the customer holds them and Opintel never receives them**, which is worth stating in a security review because it is unusual.

Pool keys, magic link tokens and SCIM tokens are stored as SHA-256 hashes. There is no route that returns a secret after creation.

## 10.6 Data handling

| Category | Where it lives | Retention |
|---|---|---|
| Customer rows | Only in the customer's source, and transiently in sidecar memory | Released after each response |
| Landed spreadsheet rows | The customer's own Postgres, written by the sidecar inside their environment | Their retention, not ours. Opintel holds the filing metadata only |
| Schema metadata | Opintel database, in the project's region | Life of the project |
| Evidence records | Opintel database, in the project's region | Configurable, 90 days default |
| Prompt text | Evidence records, subject to redaction settings | As above |
| Telemetry | Observability platform | 30 days, no customer data |

The redaction setting defaults to aggressive, so tool arguments are redacted unless a customer allowlists fields.

## 10.7 SOC 2, started in Slice 1

The observation window takes months, so evidence collection begins with the first commit rather than when a customer asks.

Controls already implemented by the architecture: logical access with defined roles, change management through the pipeline, audit logging that cannot be altered, encryption in transit and at rest, and vulnerability management through the dependency gate.

What Slice 1 must add for the auditor rather than for the product: quarterly access review with an export, an incident response runbook, a documented risk assessment, and vendor review records for the sidecar dependencies and the model provider.

**Managed authorization removes a system from audit scope**, which is the clearest commercial trigger for moving off the self-hosted deployment and is worth planning for rather than discovering.

---

# 11. Vocabulary lifecycle and readiness

The vocabulary is the compounding asset. This section specifies how it is built, who owns each part, and how an enterprise knows which concepts are safe to point an unattended agent at.

## 11.1 Two tiers, two owners

| Tier | Who builds it | When | Where it lives |
|---|---|---|---|
| **Industry core** | Opintel, from field observation | Before any customer in that vertical | `vocabulary_term` at industry scope |
| **Enterprise extension** | Professional services, with the customer | The six week deployment | `vocabulary_term` at project scope |

**The industry core is our responsibility and our asset.** It is built by sitting with practitioners, watching them do the work, and capturing what they say rather than what the schema calls things. A reinsurance underwriter says burn cost, attachment, GWP, and cession. None of those are column names.

**The enterprise extension is what the six weeks produces.** No two firms mean exactly the same thing by the same word, and the local overrides are the difference between a system that answers and one that answers correctly.

**The pack improves with each deployment.** A term that appears at three customers in the same vertical is a candidate for promotion into the industry core, which improves the starting position for every future customer. That is the same review-gated promotion path as fragments, and it is why the vocabulary is worth more than any single deployment.

## 11.2 The discovery question set

Shipped with each industry pack. A structured set of questions designed to provoke the ambiguities that matter, so a deployment produces coverage rather than whatever the consultant happened to think of.

```sql
create table discovery_question (
  id           uuid primary key default gen_random_uuid(),
  industry_id  uuid not null references industry(id) on delete cascade,
  ordinal      integer not null,
  question     text not null,          -- asked in prompt mode, verbatim
  provokes     text not null,          -- the ambiguity it is designed to surface
  concepts     jsonb not null default '[]',   -- expected concepts
  pack_version integer not null default 1
);
```

Each question names what it is for. A reinsurance example:

| Question | Provokes |
|---|---|
| What was our written premium last year? | Written, earned or signed basis. Calendar year or treaty year |
| Which cedants had the worst loss ratio this year? | Whether loss ratio is sum over sum or the average of per-treaty ratios |
| What is our aggregate exposure to flood? | Sum insured, PML, or total exposed limit |
| Show me claims for treaty year 2025 | Whether a claim belongs to the treaty year or the calendar year it was reported |

**Coverage is measurable.** A deployment reports how many of the pack's questions ran, how many produced a clarification, and how many are still unresolved. That converts six weeks of judgement into a number a customer can see and a consultant can be held to.

**A question the pack does not contain is a gap in the pack.** Where a deployment surfaces an ambiguity no question provoked, the question is written and added to the pack, and the next customer in that vertical benefits.

## 11.3 Concept readiness

The state an enterprise needs in order to plan its agents. Computed per concept, per project.

| State | Meaning | Unattended agents |
|---|---|---|
| **Declared** | A project or industry term exists, and where the concept resolves to a source, a registry entry exists | **Safe.** Will not pause, will not drift |
| **Inferred** | Resolves today by matching, with a single clear candidate | **Works, may pause.** A schema change can make it ambiguous or move it |
| **Ambiguous** | More than one plausible candidate inside the band | **Will pause or refuse** |
| **Unmapped** | Used in prompts, no mapping | **Will refuse** |

Exposed as a column on the Vocabulary screen and in the export, so an agent team can plan against it rather than discovering it in production.

**Readiness is the deployment's progress bar.** A pilot starts with most concepts inferred or unmapped and ends with the queried ones declared. That is a better measure of a deployment than the number of queries run.

## 11.4 Export

`GET /projects/:id/vocabulary/export` returns the whole vocabulary as a reviewable artifact: every term with its kind, canonical name, synonyms, formula, grain rule, source (inherited or project), and readiness state. JSON and CSV.

**This is a deliverable of the engagement, not a debugging aid.** The customer's agent teams read it to know what language works. Their architects diff it between versions. It is signed off at the end of the six weeks, and it exists whether or not they continue.

## 11.5 What the customer sees, and adapts to

At the end of the deployment the enterprise holds:

- The concept list with readiness, exported
- A record of every clarification answered and what was decided
- The unmapped list, which is the honest statement of what the system will refuse
- Per pool, whether clarification pauses or refuses

Their agent teams then adapt: use declared concepts in unattended pipelines, keep inferred ones under supervision, and avoid unmapped ones or ask for them to be defined.

**That is the operating model.** Interactive use is how the system is configured. Unattended use is what it is configured for.

---

# 12. Clarification policy

## 12.1 The problem

A clarification assumes someone can answer. A scheduled pipeline at 02:00 cannot, and an autonomous agent choosing between two options it knows nothing about is guessing with extra steps.

## 12.2 Per pool setting

```ts
type ClarificationPolicy = 'pause' | 'refuse';
```

| Value | Behaviour | For |
|---|---|---|
| `pause` (default) | The run pauses durably and waits for `respond_clarification` | An assistant with a person present |
| `refuse` | Returns `clarification_required` immediately, naming every ambiguity and the candidates | Scheduled and unattended callers |

**A refusal under this policy is not a failure to answer, it is a request for configuration.** The response names the concept, the candidates, and the fact that declaring it would prevent recurrence, so the operator has an actionable item rather than an error.

The policy is recorded on every run, so a record shows why a request refused rather than paused.

## 12.3 Ambiguities are collected, not raised one at a time

Resolution completes for **every** concept before any clarification is raised. A prompt with three ambiguities produces **one** clarification with three questions, not three sequential round trips.

```ts
type ClarificationRequest = {
  runId: RunId;
  items: Array<{
    concept: string;
    kind: 'parameter_value' | 'metric' | 'source' | 'join_path';
    candidates: Array<{ value: string; frequency?: number; detail?: string }>;
    saveAsDefaultAvailable: boolean;
  }>;
};
```

Sequential clarification is a defect, not a degraded experience. It triples latency and it makes an interactive session feel like an interrogation.

## 12.4 Save as default

Every clarification item that can be remembered offers it. Accepting writes a project-scope term or a registry entry, and that concept never asks again.

**This is the mechanism that converts interactive use into unattended reliability**, and it is why the six week deployment produces a system a pipeline can run against.

## 12.5 Tests

| ID | Case | Expected |
|---|---|---|
| CLR-01 | Pool set to `refuse`, ambiguous prompt | Immediate `clarification_required` naming every ambiguity |
| CLR-02 | Pool set to `pause`, ambiguous prompt | Durable pause, resumable |
| CLR-03 | Three ambiguities in one prompt | **One** clarification with three items |
| CLR-04 | Save as default accepted | Registry or term written; the identical prompt does not ask again |
| CLR-05 | Policy recorded | Every run states which policy applied |
| CLR-06 | Readiness after declaring | The concept moves from ambiguous to declared |
| CLR-07 | Export | Contains every term with its readiness state |
| CLR-08 | Discovery question coverage | Reports asked, clarified, and unresolved counts |

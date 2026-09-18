import { v1 } from '@authzed/authzed-node';
import { type Clock } from '../../../shared/kernel/index.js';
import type {
  AuthorizationPort,
  CheckRequest,
  CheckResult,
  RelationshipUpdate,
  ZedToken,
} from '../application/authorization-port.js';

type Snapshot = CheckResult & { capturedAtMs: number };
type CheckDebugTrace = NonNullable<NonNullable<v1.CheckPermissionResponse['debugTrace']>['check']>;
type GraphObject = CheckRequest['resource'] | CheckRequest['subject'] | RelationshipUpdate['subject'];

export type SpiceDbAuthorizationPortOptions = {
  endpoint: string;
  token: string;
  clock: Clock;
  stalenessCeilingMs: number;
  security?: v1.ClientSecurity;
};

function objectReference(reference: GraphObject): v1.ObjectReference {
  return v1.ObjectReference.create({ objectType: reference.type, objectId: reference.id });
}

function subjectReference(subject: CheckRequest['subject'] | RelationshipUpdate['subject']): v1.SubjectReference {
  return v1.SubjectReference.create({ object: objectReference(subject) });
}

function cacheKey(request: CheckRequest): string {
  return `${request.resource.type}:${request.resource.id}#${request.permission}@${request.subject.type}:${request.subject.id}`;
}

function zedToken(token: v1.ZedToken | undefined): ZedToken {
  if (token === undefined || token.token.length === 0) throw new Error('SpiceDB returned no ZedToken.');
  return token.token as ZedToken;
}

function consistency(token: ZedToken | undefined): v1.Consistency {
  return v1.Consistency.create({
    requirement: token === undefined
      ? { oneofKind: 'fullyConsistent', fullyConsistent: true }
      : { oneofKind: 'atLeastAsFresh', atLeastAsFresh: v1.ZedToken.create({ token }) },
  });
}

function isAllowed(response: v1.CheckPermissionResponse): boolean {
  return response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;
}

function tracePath(trace: CheckDebugTrace | undefined): string[] {
  if (trace === undefined) return [];
  const resource = trace.resource;
  const subject = trace.subject?.object;
  const current = resource === undefined || subject === undefined
    ? []
    : [`${resource.objectType}:${resource.objectId}#${trace.permission}@${subject.objectType}:${subject.objectId}`];
  if (trace.resolution.oneofKind !== 'subProblems') return current;
  return [...current, ...trace.resolution.subProblems.traces.flatMap(tracePath)];
}

function defaultSecurity(endpoint: string): v1.ClientSecurity {
  return endpoint.startsWith('localhost:') || endpoint.startsWith('127.0.0.1:')
    ? v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED
    : v1.ClientSecurity.SECURE;
}

export class SpiceDbAuthorizationPort implements AuthorizationPort {
  private readonly client: v1.ZedPromiseClientInterface;
  private readonly closeClient: () => void;
  private readonly snapshots = new Map<string, Snapshot>();

  constructor(private readonly options: SpiceDbAuthorizationPortOptions) {
    if (options.stalenessCeilingMs < 0) throw new Error('stalenessCeilingMs must not be negative.');
    const client = v1.NewClient(
      options.token,
      options.endpoint,
      options.security ?? defaultSecurity(options.endpoint),
    );
    this.client = client.promises;
    this.closeClient = () => client.close();
  }

  async loadSchema(schema: string): Promise<void> {
    await this.client.writeSchema(v1.WriteSchemaRequest.create({ schema }));
    this.snapshots.clear();
  }

  async check(request: CheckRequest): Promise<CheckResult> {
    const key = cacheKey(request);
    const snapshot = this.snapshots.get(key);
    const checkedAt = this.options.clock.now();
    const checkedAtMs = Date.parse(checkedAt);

    try {
      const response = await this.client.checkPermission(v1.CheckPermissionRequest.create({
        consistency: consistency(snapshot?.token),
        resource: objectReference(request.resource),
        permission: request.permission,
        subject: subjectReference(request.subject),
      }));
      const result: Snapshot = {
        allowed: isAllowed(response),
        checkedAt,
        token: zedToken(response.checkedAt),
        snapshotAgeMs: 0,
        capturedAtMs: checkedAtMs,
      };
      this.snapshots.set(key, result);
      return result;
    } catch (error) {
      if (snapshot === undefined) throw error;
      const snapshotAgeMs = checkedAtMs - snapshot.capturedAtMs;
      if (snapshotAgeMs <= this.options.stalenessCeilingMs) {
        return { ...snapshot, snapshotAgeMs };
      }
      return { ...snapshot, allowed: false, snapshotAgeMs };
    }
  }

  async checkMany(requests: CheckRequest[], options?: { withTracing: boolean }): Promise<CheckResult[]> {
    if (requests.length === 0) return [];
    const checkedAt = this.options.clock.now();
    const response = await this.client.checkBulkPermissions(v1.CheckBulkPermissionsRequest.create({
      consistency: consistency(undefined),
      withTracing: options?.withTracing ?? false,
      items: requests.map((request) => v1.CheckBulkPermissionsRequestItem.create({
        resource: objectReference(request.resource), permission: request.permission,
        subject: subjectReference(request.subject),
      })),
    }));
    const token = zedToken(response.checkedAt);
    const results = new Map<string, CheckResult>();
    for (const pair of response.pairs) {
      const request = pair.request;
      if (request?.resource === undefined || request.subject?.object === undefined || pair.response.oneofKind !== 'item') {
        throw new Error('SpiceDB returned an incomplete bulk check.');
      }
      const item = pair.response.item;
      const allowed = item.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION;
      const trace = item.debugTrace?.check;
      const explanation = options?.withTracing ? { path: tracePath(trace) } : undefined;
      const key = `${request.resource.objectType}:${request.resource.objectId}#${request.permission}@${request.subject.object.objectType}:${request.subject.object.objectId}`;
      results.set(key, { allowed, checkedAt, token, snapshotAgeMs: 0, ...(explanation === undefined ? {} : { explanation }) });
    }
    return requests.map((request) => {
      const result = results.get(cacheKey(request));
      if (result === undefined) throw new Error('SpiceDB omitted a bulk check result.');
      return result;
    });
  }

  async write(updates: RelationshipUpdate[]): Promise<ZedToken> {
    const response = await this.client.writeRelationships(v1.WriteRelationshipsRequest.create({
      updates: updates.map((update) => v1.RelationshipUpdate.create({
        operation: update.operation === 'touch'
          ? v1.RelationshipUpdate_Operation.TOUCH
          : v1.RelationshipUpdate_Operation.DELETE,
        relationship: v1.Relationship.create({
          resource: objectReference(update.resource),
          relation: update.relation,
          subject: subjectReference(update.subject),
        }),
      })),
    }));
    this.snapshots.clear();
    return zedToken(response.writtenAt);
  }

  async explain(request: CheckRequest): Promise<{ allowed: boolean; path: string[] }> {
    const response = await this.client.checkPermission(v1.CheckPermissionRequest.create({
      consistency: consistency(undefined),
      resource: objectReference(request.resource),
      permission: request.permission,
      subject: subjectReference(request.subject),
      withTracing: true,
    }));
    return { allowed: isAllowed(response), path: tracePath(response.debugTrace?.check) };
  }

  close(): void {
    this.closeClient();
  }
}

import { withPlatform } from '../../../platform/db/scope.js';
import { DomainError, err, ok } from '../../../shared/kernel/index.js';
import type { PolicyVersionReader } from '../application/version.js';
import type { EntitlementContext } from '../application/entitlement-repository.js';

export class PostgresPolicyVersions implements PolicyVersionReader {
  read(ctx: EntitlementContext) {
    return withPlatform(async tx => {
      const [project] = await tx.query<{ version: number }>(
        'SELECT policy_version AS version FROM project WHERE id=$1', [ctx.projectId],
      );
      return project ? ok(project.version) : err(new DomainError('not_found', 'The project was not found.'));
    });
  }
}

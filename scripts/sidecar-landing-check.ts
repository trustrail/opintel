import { UserId } from '../src/shared/kernel/index.js';
import type { LandingZone } from '../sidecar/ingest/watch.js';
import { startupCheck, StartupCheckError } from '../sidecar/startup-check.js';

// Development bootstrap only. Import scopes after dev:up loads its environment;
// the customer sidecar must never connect to the application's metadata database.
export async function checkDevelopmentLandingZones(zones: readonly LandingZone[]): Promise<void> {
  if (!zones.length) return;
  const { withPlatform, withTenant } = await import('../src/platform/db/scope.js');
  // Scope metadata only: these project-bound reads neither authenticate a user
  // nor write a user foreign key. No synthetic user_account row is required.
  const serviceActor = UserId('00000000-0000-4000-8000-000000000001');
  for (const zone of zones) {
    const check = `development landing zone ${zone.directory} (project ${zone.projectId}, source ${zone.sourceId})`;
    await startupCheck(check, async () => {
      const [identity] = await withPlatform(tx => tx.query<{ projectExists: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM project WHERE id=$1::uuid) AS "projectExists"`,
      [zone.projectId]));
      const [connected] = await withTenant({ projectId: zone.projectId, userId: serviceActor }, tx => tx.query<{ present: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM data_source WHERE project_id=$1 AND id=$2) AS present', [zone.projectId, zone.sourceId]));
      if (identity?.projectExists && connected?.present) return;
      const reason = !identity?.projectExists
        ? 'The referenced project no longer exists; no connected source exists for this project and source.'
        : 'The project exists, but no connected source exists for this source ID.';
      throw new StartupCheckError(check, `${reason} In development, removing tmp/sidecar and rerunning npm run dev:up resolves this stale landing configuration after a database reset.`);
    }, 'the application database identity check could not complete.');
  }
}

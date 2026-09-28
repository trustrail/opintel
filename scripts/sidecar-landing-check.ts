import { UserId } from '../src/shared/kernel/index.js';
import type { LandingZone } from '../sidecar/ingest/watch.js';
import { startupCheck, StartupCheckError } from '../sidecar/startup-check.js';

// Development bootstrap only. Import scopes after dev:up loads its environment;
// the customer sidecar must never connect to the application's metadata database.
export async function checkDevelopmentLandingZones(zones: readonly LandingZone[]): Promise<void> {
  if (!zones.length) return;
  const { withPlatform, withTenant } = await import('../src/platform/db/scope.js');
  const serviceActor = UserId('00000000-0000-4000-8000-000000000001');
  for (const zone of zones) {
    const check = `development landing zone ${zone.directory} (project ${zone.projectId}, source ${zone.sourceId})`;
    await startupCheck(check, async () => {
      const [identity] = await withPlatform(tx => tx.query<{ projectExists: boolean; reserved: boolean }>(`
        SELECT EXISTS (SELECT 1 FROM project WHERE id=$1::uuid) AS "projectExists",
          EXISTS (SELECT 1 FROM demo_source_template WHERE deployment_ref->($1::text)->>'sourceId'=$2) AS reserved`,
      [zone.projectId, zone.sourceId]));
      const [connected] = await withTenant({ projectId: zone.projectId, userId: serviceActor }, tx => tx.query<{ present: boolean }>(
        'SELECT EXISTS (SELECT 1 FROM data_source WHERE project_id=$1 AND id=$2) AS present', [zone.projectId, zone.sourceId]));
      if (identity?.projectExists && (identity.reserved || connected?.present)) return;
      const reason = !identity?.projectExists
        ? 'The referenced project no longer exists; no connected source or valid reserved demo deployment exists for this project and source.'
        : 'The project exists, but neither a connected source nor a reserved demo deployment exists for this source ID.';
      throw new StartupCheckError(check, `${reason} In development, removing tmp/sidecar and rerunning npm run dev:up resolves this stale landing configuration after a database reset.`);
    }, 'the application database identity check could not complete.');
  }
}

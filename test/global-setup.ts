import { loadDevEnvironment } from '../scripts/dev-environment.js';
import { testPreflight } from '../scripts/service-readiness.js';

export default async function globalSetup(): Promise<void> {
  const environment = loadDevEnvironment();
  await testPreflight(environment);
  // Workers receive these variables before setup.ts binds the test database.
  process.env.REQUIRE_DB_TESTS = '1';
}

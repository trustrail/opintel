const postgresAffectedTests = 23;
const redisAffectedTests = 22;
const bothServicesAffectedTests = 8;
const spiceDbAffectedTests = 5;

function configured(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

export default function globalSetup(): void {
  if (process.env.REQUIRE_DB_TESTS === '1') return;

  const postgresMissing = !configured(process.env.DATABASE_URL) && !configured(process.env.TEST_DATABASE_URL);
  const redisMissing = !configured(process.env.REDIS_URL);
  const spiceDbMissing = !configured(process.env.SPICEDB_ENDPOINT) || !configured(process.env.SPICEDB_TOKEN);
  if (!postgresMissing && !redisMissing && !spiceDbMissing) return;

  const services: string[] = [];
  if (postgresMissing) services.push(`DATABASE_URL absent (${postgresAffectedTests} tests affected)`);
  if (redisMissing) services.push(`REDIS_URL absent (${redisAffectedTests} tests affected)`);
  if (spiceDbMissing) services.push(`SPICEDB_ENDPOINT or SPICEDB_TOKEN absent (${spiceDbAffectedTests} tests affected)`);
  const totalAffected = (postgresMissing ? postgresAffectedTests : 0)
    + (redisMissing ? redisAffectedTests : 0)
    + (spiceDbMissing ? spiceDbAffectedTests : 0)
    - (postgresMissing && redisMissing ? bothServicesAffectedTests : 0);

  process.stdout.write(`Integration tests skipped: ${services.join('; ')}; ${totalAffected} tests skipped total. Set REQUIRE_DB_TESTS=1 to fail when a required service URL is absent.\n`);
}

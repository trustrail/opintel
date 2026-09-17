const postgresAffectedTests = 13;
const redisAffectedTests = 22;
const bothServicesAffectedTests = 8;

function configured(value: string | undefined): boolean {
  return value !== undefined && value.length > 0;
}

export default function globalSetup(): void {
  if (process.env.REQUIRE_DB_TESTS === '1') return;

  const postgresMissing = !configured(process.env.DATABASE_URL) && !configured(process.env.TEST_DATABASE_URL);
  const redisMissing = !configured(process.env.REDIS_URL);
  if (!postgresMissing && !redisMissing) return;

  const services: string[] = [];
  if (postgresMissing) services.push(`DATABASE_URL absent (${postgresAffectedTests} tests affected)`);
  if (redisMissing) services.push(`REDIS_URL absent (${redisAffectedTests} tests affected)`);
  const totalAffected = postgresMissing && redisMissing
    ? postgresAffectedTests + redisAffectedTests - bothServicesAffectedTests
    : postgresMissing
      ? postgresAffectedTests
      : redisAffectedTests;

  process.stdout.write(`Integration tests skipped: ${services.join('; ')}; ${totalAffected} tests skipped total. Set REQUIRE_DB_TESTS=1 to fail when a required service URL is absent.\n`);
}

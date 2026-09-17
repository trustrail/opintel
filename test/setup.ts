function testDatabaseUrl(): string | undefined {
  const configuredUrl = process.env.TEST_DATABASE_URL;
  if (configuredUrl !== undefined && configuredUrl.length > 0) {
    return configuredUrl;
  }

  const developmentUrl = process.env.DATABASE_URL;
  if (developmentUrl === undefined || developmentUrl.length === 0) {
    return undefined;
  }

  const url = new URL(developmentUrl);
  const databaseName = url.pathname.replace(/^\/+/, '');
  if (databaseName.length === 0) {
    throw new Error('DATABASE_URL must include a database name to derive TEST_DATABASE_URL.');
  }

  url.pathname = `/${databaseName}_test`;
  return url.toString();
}

const developmentDatabaseUrl = process.env.DATABASE_URL;
const isolatedDatabaseUrl = testDatabaseUrl();

if (isolatedDatabaseUrl !== undefined) {
  if (developmentDatabaseUrl === isolatedDatabaseUrl) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL.');
  }

  process.env.TEST_DATABASE_URL = isolatedDatabaseUrl;
  process.env.DATABASE_URL = isolatedDatabaseUrl;
}

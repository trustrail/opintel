import dotenv from 'dotenv';

function loadDevelopmentEnvironment(): void {
  if (process.env.NODE_ENV !== 'production') dotenv.config();
}

function apiPort(): number {
  const raw = process.env.PORT ?? process.env.API_PORT ?? '3000';
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('PORT must be an integer from 1 to 65535.');
  return port;
}

function requiredEnvironment(name: 'REDIS_URL'): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required. Copy .env.example to .env, or set it inline.`);
  return value;
}

async function start(): Promise<void> {
  loadDevelopmentEnvironment();

  const [
    { SystemClock, UuidV7IdFactory },
    { createHttpServer },
    { createRedisConnection },
    { MagicLinkService },
    { ProviderResolutionService },
    { CurrentUserService },
    { PostgresIdentityRepository, RedisRateLimiter },
    { RedisSessionStore },
    { PostgresProviderResolutionRepository },
    { magicLinkRoutes },
    { providerRoutes },
    { currentUserRoutes },
  ] = await Promise.all([
    import('../../shared/kernel/index.js'),
    import('./index.js'),
    import('../redis/index.js'),
    import('../../modules/identity/application/magic-link.js'),
    import('../../modules/identity/application/providers.js'),
    import('../../modules/identity/application/current-user.js'),
    import('../../modules/identity/infrastructure/magic-link-repositories.js'),
    import('../../modules/identity/infrastructure/redis-session-store.js'),
    import('../../modules/identity/infrastructure/provider-resolution-repository.js'),
    import('../../modules/identity/api/magic-link-routes.js'),
    import('../../modules/identity/api/provider-routes.js'),
    import('../../modules/identity/api/current-user-routes.js'),
  ]);

  const clock = new SystemClock();
  const redis = createRedisConnection({ url: requiredEnvironment('REDIS_URL') });
  await redis.connect();
  const identity = new PostgresIdentityRepository(clock);
  const sessions = new RedisSessionStore(redis.client, clock, new UuidV7IdFactory());
  const magicLinks = new MagicLinkService(identity, identity, identity, new RedisRateLimiter(redis.client), sessions, clock);
  const routes = [
    ...magicLinkRoutes(magicLinks),
    ...providerRoutes(new ProviderResolutionService(new PostgresProviderResolutionRepository())),
    ...currentUserRoutes(new CurrentUserService(sessions, identity)),
  ];
  const server = createHttpServer(routes);
  const port = apiPort();

  server.listen(port, () => { console.info(`API server listening on port ${port}.`); });
  const close = (): void => {
    server.close(() => { void redis.close(); });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

void start().catch(() => {
  console.error('API server failed to start.');
  process.exitCode = 1;
});

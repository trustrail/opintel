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

function requiredEnvironment(name: 'REDIS_URL' | 'SPICEDB_ENDPOINT' | 'SPICEDB_TOKEN'): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) throw new Error(`${name} is required. Copy .env.example to .env, or set it inline.`);
  return value;
}

async function start(): Promise<void> {
  loadDevelopmentEnvironment();

  const [
    { SessionId, SystemClock, UuidV7IdFactory },
    { createHttpServer },
    { createRedisConnection },
    { MagicLinkService },
    { ProviderResolutionService },
    { CurrentUserService },
    { PostgresIdentityRepository, RedisRateLimiter },
    { OutboxMagicLinkDispatcher },
    { RedisSessionStore },
    { LocalFileMailAdapter, MailOutbox },
    { PostgresProviderResolutionRepository },
    { magicLinkRoutes },
    { providerRoutes },
    { currentUserRoutes, cookieValue },
    { sessionCookieName },
    { RelationshipOutbox },
    { CreateCompanyService },
    { PostgresCompanyCreationRepository },
    { companyRoutes },
    { SpiceDbAuthorizationPort },
    { CreateProjectService },
    { PostgresProjectCreationRepository },
    { projectRoutes, projectUpdateRoutes },
    { UpdateProjectService },
    { PostgresProjectUpdateRepository },
    { TenancyListService },
    { PostgresTenancyListRepository },
    { tenancyListRoutes },
  ] = await Promise.all([
    import('../../shared/kernel/index.js'),
    import('./index.js'),
    import('../redis/index.js'),
    import('../../modules/identity/application/magic-link.js'),
    import('../../modules/identity/application/providers.js'),
    import('../../modules/identity/application/current-user.js'),
    import('../../modules/identity/infrastructure/magic-link-repositories.js'),
    import('../../modules/identity/infrastructure/magic-link-mail-dispatcher.js'),
    import('../../modules/identity/infrastructure/redis-session-store.js'),
    import('../mail/index.js'),
    import('../../modules/identity/infrastructure/provider-resolution-repository.js'),
    import('../../modules/identity/api/magic-link-routes.js'),
    import('../../modules/identity/api/provider-routes.js'),
    import('../../modules/identity/api/current-user-routes.js'),
    import('../../modules/identity/api/session-cookie.js'),
    import('../../modules/tenancy/index.js'),
    import('../../modules/tenancy/application/create-company.js'),
    import('../../modules/tenancy/infrastructure/company-creation-repository.js'),
    import('../../modules/tenancy/api/company-routes.js'),
    import('../../modules/authz/infrastructure/spicedb-authorization-port.js'),
    import('../../modules/tenancy/application/create-project.js'),
    import('../../modules/tenancy/infrastructure/project-creation-repository.js'),
    import('../../modules/tenancy/api/project-routes.js'),
    import('../../modules/tenancy/application/update-project.js'),
    import('../../modules/tenancy/infrastructure/project-update-repository.js'),
    import('../../modules/tenancy/application/list-tenancy.js'),
    import('../../modules/tenancy/infrastructure/tenancy-list-repository.js'),
    import('../../modules/tenancy/api/list-routes.js'),
  ]);

  const clock = new SystemClock();
  const authorization = new SpiceDbAuthorizationPort({
    endpoint: requiredEnvironment('SPICEDB_ENDPOINT'), token: requiredEnvironment('SPICEDB_TOKEN'),
    clock, stalenessCeilingMs: 0,
  });
  const relationshipOutbox = new RelationshipOutbox();
  const companies = new CreateCompanyService(
    new PostgresCompanyCreationRepository(relationshipOutbox), relationshipOutbox, authorization,
  );
  const projects = new CreateProjectService(
    new PostgresProjectCreationRepository(relationshipOutbox), relationshipOutbox, authorization,
  );
  const redis = createRedisConnection({ url: requiredEnvironment('REDIS_URL') });
  await redis.connect();
  const identity = new PostgresIdentityRepository(clock);
  const sessions = new RedisSessionStore(redis.client, clock, new UuidV7IdFactory());
  const currentUsers = new CurrentUserService(sessions, identity);
  const mail = new LocalFileMailAdapter(process.env.MAIL_OUTPUT_DIR ?? './tmp/mail', clock, undefined, process.env.APP_BASE_URL ?? 'http://localhost:5173');
  const magicLinks = new MagicLinkService(identity, identity, identity, new RedisRateLimiter(redis.client), sessions, clock, new OutboxMagicLinkDispatcher(new MailOutbox(), mail));
  const routes = [
    ...magicLinkRoutes(magicLinks),
    ...providerRoutes(new ProviderResolutionService(new PostgresProviderResolutionRepository())),
    ...currentUserRoutes(currentUsers),
    ...companyRoutes(companies),
    ...projectRoutes(projects),
    ...projectUpdateRoutes(new UpdateProjectService(new PostgresProjectUpdateRepository())),
    ...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(), authorization)),
  ];
  const server = createHttpServer(routes, {
    authorization: {
      port: authorization,
      currentUser: async (headers) => {
        const rawSessionId = cookieValue(headers.cookie, sessionCookieName);
        if (rawSessionId === null) return null;
        try {
        return await currentUsers.read(SessionId(rawSessionId));
        } catch {
          return null;
        }
      },
    },
  });
  const port = apiPort();

  server.listen(port, () => { console.info(`API server listening on port ${port}.`); });
  const close = (): void => {
    server.close(() => { authorization.close(); void redis.close(); });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

void start().catch(() => {
  console.error('API server failed to start.');
  process.exitCode = 1;
});

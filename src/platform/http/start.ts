import dotenv from 'dotenv';
import { existsSync } from 'node:fs';

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
    { ListIndustriesService },
    { PostgresIndustryListRepository },
    { industryRoutes },
    { InvitationService },
    { PostgresInvitationRepository },
    { invitationRoutes },
    { ExplainPermissionsService },
    { PostgresPermissionSubjectRepository },
    { permissionRoutes },
    { ListMembersService },
    { PostgresMemberListRepository },
    { memberRoutes },
    { MigrateIndustryService },
    { PostgresIndustryMigrationRepository },
    { industryMigrationRoutes },
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
    import('../../modules/vocabulary/application/list-industries.js'),
    import('../../modules/vocabulary/infrastructure/industry-list-repository.js'),
    import('../../modules/vocabulary/api/industry-routes.js'),
    import('../../modules/tenancy/application/invitations.js'),
    import('../../modules/tenancy/infrastructure/invitation-repository.js'),
    import('../../modules/tenancy/api/invitation-routes.js'),
    import('../../modules/tenancy/application/explain-permissions.js'),
    import('../../modules/tenancy/infrastructure/permission-subject-repository.js'),
    import('../../modules/tenancy/api/permission-routes.js'),
    import('../../modules/tenancy/application/list-members.js'),
    import('../../modules/tenancy/infrastructure/member-list-repository.js'),
    import('../../modules/tenancy/api/member-routes.js'),
    import('../../modules/tenancy/application/migrate-industry.js'),
    import('../../modules/tenancy/infrastructure/industry-migration-repository.js'),
    import('../../modules/tenancy/api/industry-migration-routes.js'),
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

  const sessions = new RedisSessionStore(redis.client, clock, new UuidV7IdFactory());

  const mail = new LocalFileMailAdapter(process.env.MAIL_OUTPUT_DIR ?? './tmp/mail', clock, undefined, process.env.APP_BASE_URL ?? 'http://localhost:5173');
  const delivery = new OutboxMagicLinkDispatcher(new MailOutbox(), mail);
  const invitations = new InvitationService(new PostgresInvitationRepository(relationshipOutbox), relationshipOutbox, authorization, clock, delivery);
  const identity = new PostgresIdentityRepository(clock, invitations);
  const currentUsers = new CurrentUserService(sessions, identity);
  const magicLinks = new MagicLinkService(identity, identity, identity, new RedisRateLimiter(redis.client), sessions, clock, delivery);
  const routes = [
    ...industryMigrationRoutes(new MigrateIndustryService(new PostgresIndustryMigrationRepository(), authorization)),
    ...magicLinkRoutes(magicLinks),
    ...invitationRoutes(invitations),
    ...memberRoutes(new ListMembersService(new PostgresMemberListRepository())),
    ...permissionRoutes(new ExplainPermissionsService(new PostgresPermissionSubjectRepository(), authorization)),
    ...providerRoutes(new ProviderResolutionService(new PostgresProviderResolutionRepository())),
    ...currentUserRoutes(currentUsers),
    ...companyRoutes(companies),
    ...projectRoutes(projects),
    ...projectUpdateRoutes(new UpdateProjectService(new PostgresProjectUpdateRepository())),
    ...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(), authorization)),
    ...industryRoutes(new ListIndustriesService(new PostgresIndustryListRepository())),
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
  // Dedicated mTLS listener: the receipt route is never mounted on the browser API.
  let receiptServer: import('node:https').Server | undefined;
  const receiptConfig = process.env.LANDING_RECEIPT_CLIENT_CONFIG ?? (process.env.NODE_ENV !== 'production' && existsSync('tmp/sidecar/client.json') ? 'tmp/sidecar/client.json' : undefined);
  if (receiptConfig) {
    const [{ loadSidecarClientOptions }, { createLandingReceiptServer }, { AcceptLandingReceipt }, { PostgresLandingReceiptRepository }] = await Promise.all([
      import('../../modules/sources/index.js'), import('../../modules/ingest/api/landing-receipt-server.js'),
      import('../../modules/ingest/application/landing-receipts.js'), import('../../modules/ingest/infrastructure/landing-receipts.js'),
    ]);
    const options = await loadSidecarClientOptions(receiptConfig);
    receiptServer = createLandingReceiptServer(options.tls, new AcceptLandingReceipt(new PostgresLandingReceiptRepository()));
    const receiptPort = Number(process.env.LANDING_RECEIPT_PORT ?? '3101');
    if (!Number.isInteger(receiptPort) || receiptPort < 1 || receiptPort > 65535) throw new Error('Invalid landing receipt port.');
    await new Promise<void>((resolve, reject) => {
      receiptServer!.once('error', reject);
      receiptServer!.listen(receiptPort, process.env.LANDING_RECEIPT_HOST ?? '127.0.0.1', resolve);
    });
  }
  const port = apiPort();

  server.listen(port, () => { console.info(`API server listening on port ${port}.`); });
  const close = (): void => {
    receiptServer?.close();
    server.close(() => { authorization.close(); void redis.close(); });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

void start().catch(() => {
  console.error('API server failed to start.');
  process.exitCode = 1;
});

import {withDiagnosticWork} from '../telemetry/diagnostics.js';
import {initializeDatabaseDiagnostics} from '../db/diagnostics.js';
import {columnTagRoutes} from '../../modules/catalog/api/tag-routes.js';
import {PostgresColumnTags} from '../../modules/catalog/infrastructure/column-tags.js';
import {PostgresRowPreview} from '../../modules/entitlements/infrastructure/row-preview.js';
import {rowDecisionRoutes} from '../../modules/entitlements/api/row-routes.js';
import {PostgresRowDecisions} from '../../modules/entitlements/infrastructure/row-decisions.js';
import {ReleaseRuntime,releaseRoutes} from '../../modules/release-custody/index.js';
import {observationRoutes,PostgresObservationReader} from '../../modules/observations/index.js';
import {PostgresSuggestions,suggestionRoutes} from '../../modules/relationships/index.js';
import {PostgresExplainJoinCandidates} from '../../modules/evidence/index.js';
import { declarationRoutes } from '../../modules/catalog/api/declaration-routes.js';
import { PostgresElementDeclarations, PostgresTemporalRepository } from '../../modules/catalog/index.js';
import {typeObservationRoutes} from '../../modules/sources/api/type-observation-routes.js';
import {PostgresTypeObservations} from '../../modules/sources/infrastructure/type-observations.js';
import {PostgresMagicLinkAccess} from '../../modules/identity/infrastructure/magic-link-access.js';
import {OutboxInvitationDelivery} from '../../modules/tenancy/infrastructure/invitation-delivery.js';
import {createOidcRuntime,createProviderResolutionRuntime} from '../../modules/identity/infrastructure/oidc-runtime.js';
import {oidcRoutes} from '../../modules/identity/api/oidc-routes.js';
import {EvidenceMaintenance} from '../../modules/evidence/index.js';
import {scheduleEvidenceMaintenance} from './evidence-maintenance.js';
import {sessionIdlePolicy} from '../../modules/identity/infrastructure/session-policy.js';
import {settingsRoutes} from '../../modules/tenancy/api/settings-routes.js';
import {PostgresSettings} from '../../modules/tenancy/index.js';
import {PostgresDashboardReader} from '../../modules/tenancy/index.js';
import {InstallationClaimAdmission,PostgresInstallationClaimRepository} from '../../modules/tenancy/index.js';
import {dashboardRoutes} from '../../modules/tenancy/api/dashboard-routes.js';
import {PostgresPoolReader} from '../../modules/pools/index.js';
import {poolReadRoutes} from '../../modules/pools/api/read-routes.js';
import {evidenceExportRoutes} from '../../modules/evidence/api/export-routes.js';
import {EvidenceExportService,PostgresEvidenceExports} from '../../modules/evidence/index.js';
import {EvidenceQuery,PostgresEvidenceReader,DuckDBEvidenceText} from '../../modules/evidence/index.js';
import {evidenceRoutes} from '../../modules/evidence/api/routes.js';
import {PostgresEvidenceWriter} from '../../modules/evidence/index.js';
import { PoolKeyService, PostgresPoolKeys, AgentPresenceService, PostgresAgentPresence, sweepAgentPresence } from '../../modules/pools/index.js';
import { poolKeyRoutes } from '../../modules/pools/api/key-routes.js';
import { agentPresenceRoutes } from '../../modules/pools/api/presence-routes.js';
import { McpAccess, McpHttpServer, PostgresMcpConfiguration, DescribeService, PostgresDescribeReader,ExplainService,QueryService,PostgresQueryReader,assertEvidenceWriter } from '../../modules/mcp/index.js';
import { PostgresKeyVerifier } from '../../modules/pools/index.js';
import { entitlementReadRoutes } from '../../modules/entitlements/api/read-routes.js';
import { PostgresEntitlementReader,QueryPreFilter,DuckDBQueryParser } from '../../modules/entitlements/index.js';
import { BulkEntitlementService, PostgresBulkEntitlements } from '../../modules/entitlements/index.js';
import { bulkEntitlementRoutes } from '../../modules/entitlements/api/bulk-routes.js';
import { PostgresOrdinalRepair } from '../../modules/sources/infrastructure/ordinal-repair.js';
import { recoverIntrospectionCompletions } from '../../modules/sources/infrastructure/introspection-completion-recovery.js';
import { KeyCustodyService,PostgresCustodyRepository } from '../../modules/entitlements/index.js';
import { keyCustodyRoutes } from '../../modules/entitlements/api/key-custody-routes.js';
import { RedisProjectHub } from '../sse/redis-hub.js';
import { projectStreamRoutes } from '../sse/routes.js';
import { introspectionRoutes } from '../../modules/sources/api/introspection-routes.js';
import { PostgresIntrospectionQuery } from '../../modules/sources/infrastructure/introspection-query.js';
import { PostgresIntrospectionStore } from '../../modules/sources/infrastructure/postgres-introspection-store.js';
import { catalogRoutes } from '../../modules/catalog/api/tree-routes.js';
import { PostgresCatalogTreeReader } from '../../modules/catalog/infrastructure/tree.js';
import dotenv from 'dotenv';
import {startDiagnostics,instrumentHttp} from '../telemetry/diagnostics.js';
import {checkDevelopmentMigrations} from './development-migrations.js';
import {checkDeploymentDatabase} from '../db/deployment-contract.js';
import {GatewayReadiness,readinessRoutes} from './readiness.js';
import {readFile} from 'node:fs/promises';
import { apiStartupExceptionLine } from '../telemetry/exception-log.js';

declare const OPINTEL_AUTHORIZATION_SCHEMA:string|undefined;

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
  await startDiagnostics();
  await checkDevelopmentMigrations();
  await checkDeploymentDatabase();
  await initializeDatabaseDiagnostics();

  const [
    { SessionId, SystemClock, UuidV7IdFactory, UserId },
    { createHttpServer },
    { createRedisConnection },
    { MagicLinkService },
    { CurrentUserService },
    { PostgresIdentityRepository, RedisRateLimiter },
    { OutboxMagicLinkDispatcher },
    { RedisSessionStore },
    { configuredMail, MailOutbox },
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
    import('../../modules/identity/application/current-user.js'),
    import('../../modules/identity/infrastructure/magic-link-repositories.js'),
    import('../../modules/identity/infrastructure/magic-link-mail-dispatcher.js'),
    import('../../modules/identity/infrastructure/redis-session-store.js'),
    import('../mail/index.js'),
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

  const lifecycle=new EvidenceMaintenance();
  // Await forward provisioning before accepting requests. Maintenance repeats after restarts.
  await lifecycle.provision();
  const stopEvidenceMaintenance=scheduleEvidenceMaintenance({
    provision:()=>lifecycle.provision(),retain:()=>lifecycle.retain(),
  },phase=>console.error({event:'evidence.maintenance_failed',phase,category:'dependency_unavailable'}));
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
  const expectedSchema=typeof OPINTEL_AUTHORIZATION_SCHEMA==='undefined'
    ? await readFile(new URL('../../../docs/opintel-schema.zed',import.meta.url),'utf8')
    : OPINTEL_AUTHORIZATION_SCHEMA;
  const readiness=new GatewayReadiness({
    PostgreSQL:checkDeploymentDatabase,
    Redis:async()=>{await redis.client.withCommandOptions({timeout:2000}).ping();},
    'SpiceDB schema':()=>authorization.requireSchema(expectedSchema),
  });
  await readiness.requireReady();

  const hub = new RedisProjectHub(redis.client, requiredEnvironment('REDIS_URL'));
  const sessions = new RedisSessionStore(redis.client, clock, new UuidV7IdFactory(),sessionIdlePolicy);

  const mail = configuredMail(clock);
  const delivery = new OutboxMagicLinkDispatcher(new MailOutbox(), mail);
  const invitations = new InvitationService(new PostgresInvitationRepository(relationshipOutbox), authorization, clock, new OutboxInvitationDelivery(new MailOutbox(),mail));
  const identity = new PostgresIdentityRepository(clock, invitations);
  const magicLinkAccess = new PostgresMagicLinkAccess();
  const currentUsers = new CurrentUserService(sessions, identity, magicLinkAccess);
  const oidc=createOidcRuntime(redis.client,identity,identity,sessions,clock);
  const ownerClaims=new InstallationClaimAdmission(new PostgresInstallationClaimRepository(relationshipOutbox),relationshipOutbox,authorization);
  let ownerGrantWork:Promise<void>|undefined;
  const reconcileOwnerGrant=()=>{if(!ownerGrantWork)ownerGrantWork=ownerClaims.reconcile().catch(()=>{console.warn({event:'installation.owner_grant_pending'});}).finally(()=>{ownerGrantWork=undefined;});};
  reconcileOwnerGrant();
  const ownerGrantTimer=setInterval(reconcileOwnerGrant,30000);ownerGrantTimer.unref();
  const magicLinks = new MagicLinkService(identity, identity, identity, new RedisRateLimiter(redis.client), sessions, clock, magicLinkAccess, delivery,ownerClaims);
  const [{ registerRoutes }, { PostgresFilingRegister }] = await Promise.all([import('../../modules/ingest/api/register-routes.js'), import('../../modules/ingest/infrastructure/register.js')]);
  const register = new PostgresFilingRegister(hub);
  const [{createSourceRuntime},{sourceRoutes},engines]=await Promise.all([import('../../modules/sources/infrastructure/source-runtime.js'),import('../../modules/sources/api/source-routes.js'),import('../../modules/engines/index.js')]);
  const applicationTls=await engines.loadApplicationTls(process.env.APPLICATION_TLS_CONFIG ?? 'tmp/sidecar/application-tls.json');
  const engineRegistry=new engines.EngineRegistry(new engines.PostgresEngineRepository(),new engines.HttpsEngineProbe(process.env.ENGINE_HEARTBEAT_URL),applicationTls,engines.engineHealthPolicy(process.env));
  engineRegistry.startHealthRefresh();
  const sources=createSourceRuntime(engineRegistry,hub);
  const heartbeatServer=process.env.ENGINE_HEARTBEAT_URL?engines.createEngineHeartbeatServer(applicationTls,new engines.EngineEgress(new engines.PostgresEngineEgress(),projectId=>sources.resume({projectId,userId:UserId('00000000-0000-4000-8000-000000000001')}))):undefined;
  if(heartbeatServer){
   const port=Number(process.env.ENGINE_HEARTBEAT_PORT??3102);
   if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid engine heartbeat port.');
   await new Promise<void>((resolve,reject)=>{heartbeatServer.once('error',reject);heartbeatServer.listen(port,process.env.ENGINE_HEARTBEAT_HOST??'127.0.0.1',resolve);});
  }
  // Durable startup repair runs through the ordinary worker, without waiting
  // for source contact before serving the API. Unknown ordinals still fail closed.
  const repair = async () => {
    for (const ctx of await new PostgresOrdinalRepair(new UuidV7IdFactory()).queue()) await sources.resume(ctx);
  };
  void withDiagnosticWork('ordinal_repair',repair).catch(() => console.warn({event:'catalog.ordinal_repair_failed',category:'dependency_unavailable'}));
  const completionStore = new PostgresIntrospectionStore(new UuidV7IdFactory(),hub);
  let deliveringCompletions = false;
  const deliverCompletions = () => {
    if (deliveringCompletions) return;
    deliveringCompletions = true;
    void withDiagnosticWork('introspection_completion',()=>recoverIntrospectionCompletions(ctx=>completionStore.dispatchCompleted(ctx)))
      .catch(()=>console.warn({event:'introspection.rules_delivery_pending',category:'dependency_unavailable'}))
      .finally(()=>{deliveringCompletions=false;});
  };
  deliverCompletions();
  const completionTimer = setInterval(deliverCompletions,30000); completionTimer.unref();
  const custody=new KeyCustodyService(new PostgresCustodyRepository(),new engines.RegistryCustodyClient(engineRegistry),authorization);
  const rehearse=()=>{void withDiagnosticWork('custody_rehearsal',()=>custody.daily()).catch(()=>console.warn({event:'custody.rehearsal_failed',category:'dependency_unavailable'}));};
  rehearse();const rehearsalTimer=setInterval(rehearse,60*60*1000);rehearsalTimer.unref();
  const presence = new PostgresAgentPresence(hub);
  let sweepingPresence = false;
  const sweepPresence = () => {
    if(sweepingPresence)return;
    sweepingPresence=true;
    void withDiagnosticWork('presence_sweep',()=>sweepAgentPresence(presence)).catch(()=>console.warn({event:'agent.presence_sweep_failed',category:'dependency_unavailable'})).finally(()=>{sweepingPresence=false;});
  };
  sweepPresence();
  const presenceTimer=setInterval(sweepPresence,5000);presenceTimer.unref();
  const evidenceQuery=new EvidenceQuery(new PostgresEvidenceReader(),authorization,new DuckDBEvidenceText());
  const releaseCustody=new ReleaseRuntime();
  await releaseCustody.provisionExisting();
  releaseCustody.start();
  const routes = [
    ...releaseRoutes(releaseCustody),
    ...settingsRoutes(new PostgresSettings(releaseCustody)),
    ...evidenceExportRoutes(new EvidenceExportService(new PostgresEvidenceExports(),evidenceQuery,authorization)),
    ...evidenceRoutes(evidenceQuery),
    ...suggestionRoutes(new PostgresSuggestions(evidenceQuery)),
    ...dashboardRoutes(new PostgresDashboardReader()),
    ...poolReadRoutes(new PostgresPoolReader()),
    ...poolKeyRoutes(new PoolKeyService(new PostgresPoolKeys(undefined,(ctx,alias)=>releaseCustody.provision(ctx,alias),releaseCustody), presence)),
    ...agentPresenceRoutes(new AgentPresenceService(presence)),
    ...keyCustodyRoutes(custody),
    ...entitlementReadRoutes(new PostgresEntitlementReader()),
    ...rowDecisionRoutes(new PostgresRowDecisions(),new PostgresRowPreview(new engines.RegistryQueryExecution(engineRegistry,new engines.PostgresEngineRepository()),new PostgresEvidenceWriter())),
    ...bulkEntitlementRoutes(new BulkEntitlementService(new PostgresBulkEntitlements())),
    ...projectStreamRoutes(hub),
    ...catalogRoutes(new PostgresCatalogTreeReader()),
    ...columnTagRoutes(new PostgresColumnTags()),
    ...declarationRoutes(new PostgresElementDeclarations(new engines.RegistryCustodyClient(engineRegistry)),new PostgresTemporalRepository()),
    ...sourceRoutes(sources),...engines.engineRoutes(engineRegistry),
    ...typeObservationRoutes(new PostgresTypeObservations()),
    ...introspectionRoutes(new PostgresIntrospectionQuery(new PostgresIntrospectionStore(new UuidV7IdFactory(),hub))),
    ...registerRoutes(register),
    ...observationRoutes(new PostgresObservationReader()),
    ...industryMigrationRoutes(new MigrateIndustryService(new PostgresIndustryMigrationRepository(), authorization)),
    ...readinessRoutes(readiness),
    ...magicLinkRoutes(magicLinks),
    ...oidcRoutes(oidc,process.env.APP_BASE_URL ?? 'http://localhost:5173'),
    ...invitationRoutes(invitations),
    ...memberRoutes(new ListMembersService(new PostgresMemberListRepository())),
    ...permissionRoutes(new ExplainPermissionsService(new PostgresPermissionSubjectRepository(), authorization)),
    ...providerRoutes(createProviderResolutionRuntime()),
    ...currentUserRoutes(currentUsers),
    ...companyRoutes(companies),
    ...projectRoutes(projects),
    ...projectUpdateRoutes(new UpdateProjectService(new PostgresProjectUpdateRepository())),
    ...tenancyListRoutes(new TenancyListService(new PostgresTenancyListRepository(), authorization)),
    ...industryRoutes(new ListIndustriesService(new PostgresIndustryListRepository())),
  ];
  const evidence=new PostgresEvidenceWriter();assertEvidenceWriter(evidence);
  const execution=new engines.RegistryQueryExecution(engineRegistry,new engines.PostgresEngineRepository()),filter=new QueryPreFilter(new DuckDBQueryParser());
  const query=new QueryService(new PostgresQueryReader(),filter,execution,authorization,evidence,releaseCustody);
  const explain=new ExplainService(new PostgresQueryReader(false),filter,execution,authorization,new UuidV7IdFactory(),new PostgresExplainJoinCandidates());
  const mcp = new McpHttpServer(new McpAccess(new PostgresKeyVerifier(), new AgentPresenceService(presence)), new PostgresMcpConfiguration(), new DescribeService(new PostgresDescribeReader(), authorization,releaseCustody),query,explain,releaseCustody);
  mcp.start();
  const server = createHttpServer(routes, {
    agentInterface: mcp,
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
  instrumentHttp(server);
  // Dedicated mTLS listener: the receipt route is never mounted on the browser API.
  let receiptServer: import('node:https').Server | undefined;
  if (process.env.LANDING_RECEIPT_PORT || process.env.NODE_ENV !== 'production') {
    const [{ createLandingReceiptServer }, { AcceptLandingReceipt }, { PostgresLandingReceiptRepository }] = await Promise.all([
      import('../../modules/ingest/api/landing-receipt-server.js'), import('../../modules/ingest/application/landing-receipts.js'), import('../../modules/ingest/infrastructure/landing-receipts.js'),
    ]);
    receiptServer = createLandingReceiptServer(applicationTls, new AcceptLandingReceipt(new PostgresLandingReceiptRepository(hub)), register, engines.authorizeEngineReceipt);
    instrumentHttp(receiptServer);
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
    engineRegistry.close();
    releaseCustody.close();
    stopEvidenceMaintenance();
    clearInterval(ownerGrantTimer);
    clearInterval(presenceTimer);
    clearInterval(rehearsalTimer);
    clearInterval(completionTimer);
    void sources.close();
    void mcp.close();
    void hub.close();
    receiptServer?.close();
    heartbeatServer?.close();
    server.close(() => { authorization.close(); void redis.close(); });
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
}

const startupDeadline=setTimeout(()=>{
  process.stderr.write('Gateway API startup exceeded 30 seconds. Check its configured dependencies.\n',()=>process.exit(1));
},30000);
void start().then(()=>clearTimeout(startupDeadline)).catch((error: unknown) => {
  clearTimeout(startupDeadline);
  process.stderr.write(apiStartupExceptionLine(error)+'\n',()=>process.exit(1));
});

import {ProviderResolutionService} from '../application/providers.js';
import {PostgresProviderResolutionRepository} from './provider-resolution-repository.js';
import {ConfiguredPlatformProviders} from './platform-provider-readiness.js';
import {EnvironmentSecretStore} from '../../../platform/secrets/index.js';
import type {RedisClient} from '../../../platform/redis/index.js';
import type {Clock} from '../../../shared/kernel/index.js';
import {OidcService} from '../application/oidc.js';
import type {AccountRepository,InviteRepository} from '../application/magic-link.js';
import type {SessionPort} from '../application/session.js';
import {PostgresOidcConfigurationRepository} from './oidc-configuration-repository.js';
import {RedisOidcFlowStore} from './oidc-flow-store.js';
import {OpenIdClientAdapter} from './openid-client-adapter.js';
export function createOidcRuntime(redis:RedisClient,accounts:AccountRepository,invites:InviteRepository,sessions:SessionPort,clock:Clock):OidcService{
 return new OidcService(new PostgresOidcConfigurationRepository(),new RedisOidcFlowStore(redis),new OpenIdClientAdapter(new EnvironmentSecretStore()),accounts,invites,sessions,clock);
}

export function createProviderResolutionRuntime():ProviderResolutionService{
 return new ProviderResolutionService(new PostgresProviderResolutionRepository(),new ConfiguredPlatformProviders(new PostgresOidcConfigurationRepository(),new EnvironmentSecretStore()));
}

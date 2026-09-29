import {afterEach,expect,it,vi} from 'vitest';
import {EnvironmentSecretStore} from '../src/platform/secrets/index.js';
import {PostgresOidcConfigurationRepository} from '../src/modules/identity/infrastructure/oidc-configuration-repository.js';
import {ConfiguredPlatformProviders} from '../src/modules/identity/infrastructure/platform-provider-readiness.js';
import {ProviderResolutionService} from '../src/modules/identity/application/providers.js';
afterEach(()=>vi.unstubAllEnvs());
function clear(){for(const name of Object.keys(process.env))if(name.startsWith('OIDC_')||name.startsWith('OPINTEL_SECRET_OIDC_'))vi.stubEnv(name,undefined);}
function configure(key:'GOOGLE'|'ENTRA'){
 vi.stubEnv(`OIDC_${key}_ISSUER`,'https://idp.example');vi.stubEnv(`OIDC_${key}_CLIENT_ID`,'client-id-sentinel');vi.stubEnv(`OIDC_${key}_CLIENT_SECRET_REF`,`secret://oidc/${key.toLowerCase()}`);
}
it('platform configuration and secrets are checked on every resolution, and no credential enters the response',async()=>{
 clear();const readiness=new ConfiguredPlatformProviders(new PostgresOidcConfigurationRepository(),new EnvironmentSecretStore());
 const service=new ProviderResolutionService({findCompanyForDomain:async()=>null},readiness);
 expect(await service.resolve('user@example.com')).toEqual({magicLink:true,providers:[],enforced:null});
 configure('GOOGLE');expect((await service.resolve('user@example.com')).providers).toEqual([]);
 vi.stubEnv('OPINTEL_SECRET_OIDC_GOOGLE','SECRET_SENTINEL');
 const available=await service.resolve('user@example.com');expect(available.providers.map(p=>p.provider)).toEqual(['oidc:google']);
 for(const hidden of ['SECRET_SENTINEL','client-id-sentinel','secret://','https://idp.example'])expect(JSON.stringify(available)).not.toContain(hidden);
 configure('ENTRA');vi.stubEnv('OPINTEL_SECRET_OIDC_ENTRA','SECOND_SECRET_SENTINEL');expect((await service.resolve('user@example.com')).providers.map(p=>p.provider)).toEqual(['oidc:google','oidc:entra']);
 vi.stubEnv('OPINTEL_SECRET_OIDC_GOOGLE',undefined);expect((await service.resolve('user@example.com')).providers.map(p=>p.provider)).toEqual(['oidc:entra']);
 vi.stubEnv('OPINTEL_SECRET_OIDC_ENTRA','');expect((await service.resolve('user@example.com')).providers).toEqual([]);
});
it.each(['OIDC_GOOGLE_ISSUER','OIDC_GOOGLE_CLIENT_ID','OIDC_GOOGLE_CLIENT_SECRET_REF'])('does not advertise a provider missing %s',async name=>{
 clear();configure('GOOGLE');vi.stubEnv('OPINTEL_SECRET_OIDC_GOOGLE','secret');vi.stubEnv(name,undefined);
 expect(await new ConfiguredPlatformProviders(new PostgresOidcConfigurationRepository(),new EnvironmentSecretStore()).available('oidc:google')).toBe(false);
});
it('an invalid reference or failed secret store hides that platform provider without probing discovery',async()=>{
 clear();configure('GOOGLE');const resolve=vi.fn().mockRejectedValue(new Error('secret store unavailable'));
 const readiness=new ConfiguredPlatformProviders(new PostgresOidcConfigurationRepository(),{resolve});expect(await readiness.available('oidc:google')).toBe(false);expect(resolve).toHaveBeenCalledTimes(1);
 vi.stubEnv('OIDC_GOOGLE_CLIENT_SECRET_REF','literal-secret');expect(await readiness.available('oidc:google')).toBe(false);expect(resolve).toHaveBeenCalledTimes(1);
});

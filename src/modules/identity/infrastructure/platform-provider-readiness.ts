import type {SecretStorePort} from '../../../platform/secrets/index.js';
import type {OidcConfigurationRepository} from '../application/oidc.js';
import type {PlatformProviderReadiness} from '../application/providers.js';

/** Resolve on each lookup. Never probe discovery, retain a secret, or expose it. */
export class ConfiguredPlatformProviders implements PlatformProviderReadiness {
 constructor(private readonly configurations:Pick<OidcConfigurationRepository,'find'>,private readonly secrets:Pick<SecretStorePort,'resolve'>){}
 async available(provider:string):Promise<boolean>{
  try{
   const configuration=await this.configurations.find(provider,null);
   if(!configuration||!configuration.issuer.trim()||!configuration.clientId.trim())return false;
   new URL(configuration.issuer);
   return (await this.secrets.resolve(configuration.clientSecretRef)).length>0;
  }catch{return false;}
 }
}

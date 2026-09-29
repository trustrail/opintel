import {createHash} from 'node:crypto';
import {CompanyIdpId,type CompanyId,type UserId,type SessionId,type Timestamp} from '../../../shared/kernel/index.js';
import { withPlatform } from '../../../platform/db/scope.js';
import { SecretRef } from '../../../platform/secrets/index.js';
import type { OidcConfigurationRepository, OidcProviderConfiguration } from '../application/oidc.js';

type IdpRow = {
  id: string;
  configuration_version: string;
  scope: string;
  provider: string;
  issuer: string;
  client_id: string;
  client_secret_ref: string;
  discovery_url: string | null;
};

export class PostgresOidcConfigurationRepository implements OidcConfigurationRepository {
  async find(provider: string, companyId: import('../../../shared/kernel/index.js').CompanyId | null): Promise<OidcProviderConfiguration | null> {
    if (companyId === null) {
      const key=provider==='oidc:google'?'GOOGLE':provider==='oidc:entra'?'ENTRA':null;
      if(!key)return null;
      const issuer=process.env[`OIDC_${key}_ISSUER`],clientId=process.env[`OIDC_${key}_CLIENT_ID`],secret=process.env[`OIDC_${key}_CLIENT_SECRET_REF`];
      if(!issuer||!clientId||!secret)return null;
      const scope=process.env[`OIDC_${key}_SCOPE`]??'openid email profile';
      return {id:null,configurationVersion:createHash('sha256').update(JSON.stringify([provider,issuer,clientId,secret,scope])).digest('hex'),scope,provider,issuer,clientId,clientSecretRef:SecretRef(secret),discoveryUrl:null};
    }
    const rows = await withPlatform((tx) => tx.query<IdpRow>(
      `SELECT id, configuration_version, scope, provider, issuer, client_id, client_secret_ref, discovery_url
       FROM company_idp WHERE company_id = $1 AND provider = $2 AND enabled`,
      [companyId, provider],
    ));
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: CompanyIdpId(row.id), configurationVersion: row.configuration_version, scope: row.scope,
      provider: row.provider,
      issuer: row.issuer,
      clientId: row.client_id,
      clientSecretRef: SecretRef(row.client_secret_ref),
      discoveryUrl: row.discovery_url,
    };
  }
  async recordCompletedSignIn(companyId:CompanyId|null,configuration:OidcProviderConfiguration,userId:UserId,sessionId:SessionId,at:Timestamp):Promise<boolean>{
    if(companyId===null)return configuration.id===null;
    return withPlatform(async tx=>{
      await tx.query('SELECT id FROM company WHERE id=$1 FOR UPDATE',[companyId]);
      const rows=await tx.query('SELECT id FROM company_idp WHERE id=$1 AND company_id=$2 AND configuration_version=$3 AND enabled',[configuration.id,companyId,configuration.configurationVersion]);
      if(!rows.length)return false;
      await tx.query('INSERT INTO company_idp_sign_in(idp_id,configuration_version,user_id,session_id,completed_at) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING',[configuration.id,configuration.configurationVersion,userId,sessionId,at]);
      return true;
    });
  }

}

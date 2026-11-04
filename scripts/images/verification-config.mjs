// The verification job receives its own explicit configuration, not the
// gateway operator job environment. Values remain private to the output file.
import {URL} from 'node:url';
export function verificationConfig({runtime,provider,ownerEmail,applicationUrl,heartbeatUrl}){
 const names=['DATABASE_URL','REDIS_URL','SPICEDB_ENDPOINT','SPICEDB_TOKEN','OPINTEL_CUSTODY_MASTER_KEY'];
 const xq=['OPINTEL_XQ_API_KEY','OPINTEL_XQ_DASHBOARD_API_KEY','OPINTEL_XQ_SENDER_ALIAS','OPINTEL_XQ_SENDER_ACCESS_TOKEN','OPINTEL_XQ_TEAM_ID'];
 const value=(source,name)=>{const v=source[name];if(typeof v!=='string'||!v||/[\r\n\0]/u.test(v))throw new Error('Verification configuration missing or invalid: '+name);return v;};
 const url=(v,name)=>{try{if(typeof v==='string'&&!/[\r\n\0]/u.test(v)&&new URL(v).protocol==='https:')return v;}catch{/* Report the setting, never its value. */}throw new Error('Verification configuration requires HTTPS: '+name);};
 return {...Object.fromEntries(names.map(name=>[name,value(runtime,name)])),...Object.fromEntries(xq.map(name=>[name,value(provider,name)])),
  OWNER_EMAIL:value({OWNER_EMAIL:ownerEmail},'OWNER_EMAIL'),APP_BASE_URL:url(applicationUrl,'APP_BASE_URL'),
  OPINTEL_API_BASE_URL:url(applicationUrl,'OPINTEL_API_BASE_URL'),OPINTEL_OPERATOR_API_TARGET:'https://ingress:8444',
  ENGINE_HEARTBEAT_URL:url(heartbeatUrl,'ENGINE_HEARTBEAT_URL'),APPLICATION_TLS_CONFIG:'/config/application-tls.json',
  OPINTEL_XQ_REDEEM_URL:'https://validation.xqmsg.net/v2/key',OPINTEL_DEPLOYMENT_PACKAGE:'gateway',OPINTEL_CUSTOMER_JOB:'1',
  OPINTEL_OPERATOR_CONFIG:'/output/operator.json',OPINTEL_PROVISION_MANIFEST:'/output/provision.json',OPINTEL_SOAK_MANIFEST:'/output/soak.json',
  OPINTEL_SEED_MANIFEST:'/output/seed.json',OPINTEL_CERTIFICATES:'/output/certificates.json',OPINTEL_OUTPUT_DIRECTORY:'/output',
  OPINTEL_SOAK_OUTPUT_DIRECTORY:'/output/soak',OPINTEL_SOAK_DURATION:'1800',OPINTEL_SOAK_RATE:'10000',OPINTEL_PACKAGED_SOAK:'1',
  NODE_EXTRA_CA_CERTS:'/config/ca.pem',STEPS_XQ_API_KEY_FILE:'/input/xq-api-key',HOME:'/home/operator'};
}

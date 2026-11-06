import {z} from 'zod';
export const engineTransportSettingDefinitions={
 maxSessions:{env:'ENGINE_TRANSPORT_MAX_SESSIONS',default:1,min:1,max:16},
 maxConcurrentStreams:{env:'ENGINE_TRANSPORT_MAX_CONCURRENT_STREAMS',default:32,min:1,max:1024},
 idleTimeoutMs:{env:'ENGINE_TRANSPORT_IDLE_TIMEOUT_MS',default:60000,min:1000,max:3600000},
 maxSessionAgeMs:{env:'ENGINE_TRANSPORT_MAX_SESSION_AGE_MS',default:600000,min:1000,max:86400000},
 connectTimeoutMs:{env:'ENGINE_TRANSPORT_CONNECT_TIMEOUT_MS',default:5000,min:100,max:120000},
 pingIntervalMs:{env:'ENGINE_TRANSPORT_PING_INTERVAL_MS',default:15000,min:1000,max:300000},
} as const;
export type EngineTransportSettings={ -readonly [K in keyof typeof engineTransportSettingDefinitions]:number };
export function engineTransportSettingsFromEnv(env:Record<string,string|undefined>):EngineTransportSettings{
 const settings={} as EngineTransportSettings;
 for(const name of Object.keys(engineTransportSettingDefinitions) as Array<keyof EngineTransportSettings>){
  const definition=engineTransportSettingDefinitions[name],raw=env[definition.env];
  const result=z.coerce.number().int().min(definition.min).max(definition.max).safeParse(raw===undefined?definition.default:raw);
  if(!result.success)throw new Error(`Invalid ${definition.env}: use an integer from ${definition.min} to ${definition.max}.`);
  settings[name]=result.data;
 }
 return settings;
}
export const engineTransportDefaults=engineTransportSettingsFromEnv({});

import {ProjectId} from '../../../src/shared/kernel/index.js';
import {withOperatorObserver} from '../../../src/platform/ops/observer.js';
import {createRedisConnection} from '../../../src/platform/redis/index.js';
const redis=createRedisConnection({url:process.env.REDIS_URL!});await redis.connect();
await withOperatorObserver(redis.client,{projectId:ProjectId(process.env.OBSERVER_PROJECT!),ownerEmail:'owner@example.invalid',durationSeconds:1800,file:process.env.OBSERVER_FILE!},()=>new Promise<void>(()=>{process.send?.('ready');setInterval(()=>{},1000);}));

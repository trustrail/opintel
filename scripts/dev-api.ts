import {config} from 'dotenv';

// Development entry point: resolve .env before imports construct database pools.
if(process.env.NODE_ENV!=='production')config();
await import('../src/platform/http/start.js');

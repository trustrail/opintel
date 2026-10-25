import type {DemoManifest} from '../soak/manifest.js';
import {OperatorConflict} from './common.js';
export function matchingSettings(old:Record<string,unknown>,next:Record<string,unknown>):Record<string,unknown>{
 const result={...old};for(const [key,value]of Object.entries(next)){const previous=old[key];if(previous===undefined)result[key]=value;else if(previous&&value&&typeof previous==='object'&&typeof value==='object'&&!Array.isArray(previous)&&!Array.isArray(value))result[key]=matchingSettings(previous as Record<string,unknown>,value as Record<string,unknown>);else if(JSON.stringify(previous)!==JSON.stringify(value))throw new OperatorConflict('Project setting conflict: '+key);}return result;
}
export function lifecycleReady(m:DemoManifest,duration:number,now=Date.now()){
 if(!Number.isSafeInteger(duration)||duration<1)throw new OperatorConflict('Declare positive soak duration in seconds');
 for(const kind of ['retiring','revoked']){const p=m.lifecycle?.[kind];if(!p?.done)throw new OperatorConflict('Missing explicit lifecycle setup: '+kind);if(kind==='retiring'&&(!p.graceUntil||!Number.isFinite(Date.parse(p.graceUntil))||Date.parse(p.graceUntil)<now+(duration+120)*1000))throw new OperatorConflict('Retiring grace window expired or too short; explicit lifecycle renewal required');}
}

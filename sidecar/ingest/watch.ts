// Compatibility entry point: the register owns the durable arrival history.
export { FilingRegister as LandingWatcher, MissingLandingStateError, landingZoneSchema } from './register.js';
export type { LandingZone, WatchedFiling } from './register.js';

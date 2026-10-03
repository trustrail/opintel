import type {TypeObservation} from '../../../shared/api/type-observations.js';
import type {IntrospectionContext} from './introspection-store.js';
import type {SourceId} from '../../../shared/kernel/index.js';
export type TypeObservationCursor={sourceId:SourceId;sourceType:string};
export interface TypeObservations {
 list(ctx:IntrospectionContext,after:TypeObservationCursor|null,limit:number):Promise<TypeObservation[]>;
}

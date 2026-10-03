import {z} from 'zod';
export const TypeObservation=z.object({
 sourceId:z.uuid(),sourceName:z.string(),sourceType:z.string(),runId:z.uuid(),
 elementCount:z.number().int().positive(),observedAt:z.iso.datetime({offset:true}),
});
export const TypeObservationPage=z.object({items:z.array(TypeObservation),nextCursor:z.string().nullable()});
export type TypeObservation=z.infer<typeof TypeObservation>;

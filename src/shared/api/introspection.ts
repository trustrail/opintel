import { z } from 'zod';
export const IntrospectionRunView = z.object({
 id:z.uuid(),sourceId:z.uuid(),state:z.enum(['queued','connecting','reading','diffing','complete','failed','cancelled']),
 progress:z.object({objects:z.number().int().nonnegative(),total:z.number().int().nonnegative().nullable()}),error:z.string().nullable(),
 startedAt:z.iso.datetime({offset:true}).nullable(),endedAt:z.iso.datetime({offset:true}).nullable(),
 diff:z.array(z.object({change:z.enum(['added','removed','renamed','type_changed','ordinal_changed','collision']),elementId:z.uuid().nullable(),exposedName:z.string().nullable(),before:z.string().nullable(),after:z.string().nullable(),breaking:z.boolean()})).nullable(),
});
export const IntrospectionRunList = z.object({items:z.array(IntrospectionRunView),nextCursor:z.string().nullable()});
export type RunView = z.infer<typeof IntrospectionRunView>;

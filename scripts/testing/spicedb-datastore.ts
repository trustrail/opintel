import {v1} from '@authzed/authzed-node';

export type DatastoreSnapshot = {revision: string | null; relationships: v1.Relationship[]};
export function datastoreClient() {
  const endpoint=process.env.SPICEDB_ENDPOINT,token=process.env.SPICEDB_TOKEN;
  if(!endpoint||!token)throw new Error('SpiceDB is required for datastore observation.');
  return v1.NewClient(token,endpoint,v1.ClientSecurity.INSECURE_LOCALHOST_ALLOWED);
}
export async function datastoreSnapshot(client:ReturnType<typeof v1.NewClient>):Promise<DatastoreSnapshot> {
  let schema:v1.ReadSchemaResponse;
  try{schema=await client.promises.readSchema(v1.ReadSchemaRequest.create());}
  catch(error){
    if(typeof error==='object'&&error!==null&&'code' in error&&error.code===5)return {revision:null,relationships:[]};
    throw error;
  }
  if(!schema.readAt)throw new Error('SpiceDB did not report a datastore revision.');
  const relationships:v1.Relationship[]=[];
  for(const match of schema.schemaText.matchAll(/definition\s+(\w+)\s*\{/gu)){
    const rows=await client.promises.readRelationships(v1.ReadRelationshipsRequest.create({
      consistency:{requirement:{oneofKind:'atExactSnapshot',atExactSnapshot:schema.readAt}},
      relationshipFilter:{resourceType:match[1]!},
    }));
    for(const row of rows){if(!row.relationship)throw new Error('SpiceDB returned a relationship without its tuple.');relationships.push(row.relationship);}
  }
  return {revision:schema.readAt.token,relationships};
}
const identity=(r:v1.Relationship)=>JSON.stringify([r.resource,r.relation,r.subject]);
export async function removeFixtureRelationships(client:ReturnType<typeof v1.NewClient>,before:DatastoreSnapshot):Promise<number> {
  const keep=new Set(before.relationships.map(identity));
  const added=(await datastoreSnapshot(client)).relationships.filter(r=>!keep.has(identity(r)));
  for(let offset=0;offset<added.length;offset+=500){
    await client.promises.writeRelationships(v1.WriteRelationshipsRequest.create({updates:added.slice(offset,offset+500).map(relationship=>({operation:v1.RelationshipUpdate_Operation.DELETE,relationship}))}));
  }
  const remaining=await datastoreSnapshot(client);
  if(remaining.relationships.some(r=>!keep.has(identity(r))))throw new Error('Performance fixture relationship cleanup could not be confirmed.');
  return added.length;
}

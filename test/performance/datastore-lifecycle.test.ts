import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {afterAll,beforeAll,expect,it} from 'vitest';
import {v1} from '@authzed/authzed-node';
import {datastoreClient,datastoreSnapshot} from '../../scripts/testing/spicedb-datastore.js';
import {warmPerformanceProcess} from '../../scripts/testing/performance-warmup.js';
let client:ReturnType<typeof datastoreClient>,baseline:number;
const company=randomUUID(),user=randomUUID();
beforeAll(async()=>{
 await warmPerformanceProcess();client=datastoreClient();
 await client.promises.writeSchema(v1.WriteSchemaRequest.create({schema:await readFile('docs/opintel-schema.zed','utf8')}));
 await client.promises.writeRelationships(v1.WriteRelationshipsRequest.create({updates:[{operation:v1.RelationshipUpdate_Operation.TOUCH,relationship:{resource:{objectType:'company',objectId:company},relation:'admin',subject:{object:{objectType:'user',objectId:user}}}}]}));
 baseline=(await datastoreSnapshot(client)).relationships.length;
},60000);
for(const n of [1,2])it(`relationship fixture ${n}: body tuples are deleted while beforeAll tuples survive`,async()=>{
 expect((await datastoreSnapshot(client)).relationships).toHaveLength(baseline);
 await client.promises.writeRelationships(v1.WriteRelationshipsRequest.create({updates:[{operation:v1.RelationshipUpdate_Operation.TOUCH,relationship:{resource:{objectType:'project',objectId:randomUUID()},relation:'viewer',subject:{object:{objectType:'user',objectId:user}}}}]}));
 expect((await datastoreSnapshot(client)).relationships).toHaveLength(baseline+1);
});
afterAll(async()=>{try{expect((await datastoreSnapshot(client)).relationships).toHaveLength(baseline);}finally{client?.close();}});

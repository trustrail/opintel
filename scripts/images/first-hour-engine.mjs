import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {z} from 'zod';
const paired=z.object({kind:z.literal('engine'),address:z.url(),pin:z.string().min(1)});
/** Use the same pairing projection mounted into the API, including its
 * same-host Docker route. The original peer file retains the LAN identity. */
export function firstHourEngine(gateway){
 const file=join(gateway,'state/paired-engines/peer.json');
 const parsed=paired.safeParse(JSON.parse(readFileSync(file,'utf8')));
 if(!parsed.success)throw new Error('First-hour engine pairing projection is invalid.');
 return {address:parsed.data.address,pin:parsed.data.pin};
}

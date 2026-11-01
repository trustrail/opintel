import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {schemaSpecSchema,generatorSpecSchema} from './contract.js';
import {generateRows} from './generate.js';
import {DemoWorkbookWriter} from './infrastructure/workbook-writer.js';
import pack from '../reinsurance.json' with {type:'json'};
/** Internal file generator. No landing register, source, engine or provisioning. */
export async function writeWorkbooks(directory:string){
 const schema=schemaSpecSchema.parse(pack.schemaSpec),generator=generatorSpecSchema.parse(pack.generatorSpec),writer=new DemoWorkbookWriter();
 await mkdir(directory,{recursive:true,mode:0o700});
 const paths:string[]=[];
 for(const file of generator.files??[]){
  const object=schema.schemas.flatMap(s=>s.objects).find(o=>o.name===`${file.party}_${file.kind}`);
  if(!object)throw new Error('Workbook definition names an absent object.');
  const path=join(directory,`${file.id}_${file.period}.xlsx`);
  await writer.write(path,file,object,generateRows(generator,file,object));paths.push(path);
 }
 return paths;
}

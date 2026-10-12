import {mkdir,writeFile} from 'node:fs/promises';
import {relative,join} from 'node:path';
import {BaseSequencer,type TestSpecification} from 'vitest/node';
import {repositoryRoot} from '../dev-environment.js';
const path=(moduleId:string)=>relative(repositoryRoot,moduleId).replaceAll('\\','/');
export function orderNormalFiles<T extends {moduleId:string;project:{name:string}}>(files:readonly T[]):T[]{
 const compare=(a:string,b:string)=>a<b?-1:a>b?1:0;
 return [...files].sort((a,b)=>compare(a.project.name,b.project.name)||compare(path(a.moduleId),path(b.moduleId)));
}
export default class NormalSequencer extends BaseSequencer{
 override async sort(files:TestSpecification[]):Promise<TestSpecification[]>{
  // Deliberately never call super.sort: it uses cached failures and durations.
  const ordered=orderNormalFiles(files);
  const directory=process.env.OPINTEL_NORMAL_RUN_METADATA;
  if(directory){await mkdir(directory,{recursive:true});await writeFile(join(directory,'order.json'),JSON.stringify({ordering:'project name, then repository-relative path; codepoint lexical',shuffle:false,cacheOrdering:false,files:ordered.map(file=>({project:file.project.name,path:path(file.moduleId)}))},null,2)+'\n');}
  console.info(JSON.stringify({normalTestOrder:ordered.map(file=>path(file.moduleId)),cacheOrdering:false,shuffle:false,metadata:directory?join(directory,'order.json'):null}));
  return ordered;
 }
}

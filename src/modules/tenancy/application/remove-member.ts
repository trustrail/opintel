import {DomainError,err,type ProjectId,type UserId,type Result} from '../../../shared/kernel/index.js';
import type {AuthorizationPort,RelationshipUpdate,AuthorizationRevision} from '../../authz/index.js';
export type ProjectGrantRemoval={removed:boolean;companyAccessRemains:boolean};
export interface ProjectGrantRemovalRepository{
 remove(project:ProjectId,user:UserId,actor:UserId,write:(update:RelationshipUpdate)=>Promise<AuthorizationRevision>):Promise<Result<ProjectGrantRemoval,DomainError>>;
}
export class RemoveProjectMemberService{
 constructor(private readonly repository:ProjectGrantRemovalRepository,private readonly authorization:AuthorizationPort){}
 async remove(project:ProjectId,user:UserId,actor:UserId):Promise<Result<ProjectGrantRemoval,DomainError>>{
  try{return await this.repository.remove(project,user,actor,update=>this.authorization.write([update]));}
  catch{return err(new DomainError('dependency_unavailable','The project grant could not be removed. Access changes have not been confirmed. Please try again.',undefined,true));}
 }
}

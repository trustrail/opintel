import {MailOutbox,type MailPort} from '../../../platform/mail/index.js';
import {DomainError} from '../../../shared/kernel/index.js';
import type {InvitationDelivery,InvitationDispatch} from '../application/invitations.js';

export class OutboxInvitationDelivery implements InvitationDelivery {
 constructor(private readonly outbox:MailOutbox,private readonly mail:MailPort){}
 async dispatch(message:InvitationDispatch):Promise<void>{
  const result=message.kind==='magic_link'
   ?await this.outbox.dispatchOne(this.mail,`magic_link:${message.tokenId}`,{token:message.token})
   :await this.outbox.dispatchOne(this.mail,`invitation:${message.invitationId}`,{});
  if(result.retained>0)throw new DomainError('dependency_unavailable','The invitation email could not be sent.',undefined,true);
 }
}

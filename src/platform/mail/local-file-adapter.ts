import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {z} from 'zod';
import {
  DomainError,
  err,
  ok,
  SystemClock,
  type Clock,
  type Result,
} from '../../shared/kernel/index.js';
import type { MailPort, MailReceipt, OutboundMail } from './types.js';

type UrlLogger = (url: URL) => void;

const logUrl: UrlLogger = (url) => {
  if (process.env.NODE_ENV !== 'production') console.info(url.toString());
};

function messageFileName(idempotencyKey: string): string {
  return `${createHash('sha256').update(idempotencyKey).digest('hex')}.json`;
}

export class LocalFileMailAdapter implements MailPort {
  constructor(
    private readonly directory: string,
    private readonly clock: Clock = new SystemClock(),
    private readonly logger: UrlLogger = logUrl,
    private readonly appBaseUrl = 'http://localhost:5173',
  ) {}

  async send(message: OutboundMail): Promise<Result<MailReceipt, DomainError>> {
    const acceptedAt = this.clock.now();
    const filePath = path.join(this.directory, messageFileName(message.idempotencyKey));
    const url = pathToFileURL(filePath);
    const magicLink = this.magicLink(message);
    const invitationLink = this.invitationLink(message);
    if(message.template==='invitation'&&invitationLink===null)return err(new DomainError('dependency_unavailable','Invitation mail cannot be rendered.',undefined,true));
    if (message.template === 'magic_link' && magicLink === null) {
      return err(new DomainError('dependency_unavailable', 'Magic-link mail cannot be rendered.', undefined, true));
    }
    const rendered = invitationLink!==null?{...message,vars:{...message.vars,url:invitationLink.toString()}}:magicLink === null ? message : { ...message, vars: { tokenId: message.vars.tokenId ?? null, url: magicLink.toString() } };
    const contents = `${JSON.stringify({ ...rendered, acceptedAt })}\n`;

    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(filePath, contents, { encoding: 'utf8', flag: 'w' });
      this.logger(magicLink ?? url);
      return ok({ providerId: url.toString(), acceptedAt });
    } catch {
      return err(new DomainError(
        'dependency_unavailable',
        'Local mail delivery is unavailable.',
        undefined,
        true,
      ));
    }
  }

  private magicLink(message: OutboundMail): URL | null {
    if (message.template !== 'magic_link') return null;
    const token = message.vars.token;
    if (typeof token !== 'string' || token.length === 0) return null;
    const url = new URL('/auth/callback', this.appBaseUrl);
    url.searchParams.set('token', token);
    return url;
  }

  private invitationLink(message:OutboundMail):URL|null {
    if(message.template!=='invitation')return null;
    const parsed=z.object({provider:z.string().regex(/^oidc:[a-zA-Z0-9_-]+$/u),companyId:z.uuid(),inviteId:z.uuid()}).safeParse(message.vars);
    if(!parsed.success)return null;
    const url=new URL(`/auth/oidc/${parsed.data.provider}/start`,this.appBaseUrl);
    url.searchParams.set('companyId',parsed.data.companyId);url.searchParams.set('inviteId',parsed.data.inviteId);
    return url;
  }
}

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
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

const logUrl: UrlLogger = (url) => console.info(url.toString());

function messageFileName(idempotencyKey: string): string {
  return `${createHash('sha256').update(idempotencyKey).digest('hex')}.json`;
}

export class LocalFileMailAdapter implements MailPort {
  constructor(
    private readonly directory: string,
    private readonly clock: Clock = new SystemClock(),
    private readonly logger: UrlLogger = logUrl,
  ) {}

  async send(message: OutboundMail): Promise<Result<MailReceipt, DomainError>> {
    const acceptedAt = this.clock.now();
    const filePath = path.join(this.directory, messageFileName(message.idempotencyKey));
    const url = pathToFileURL(filePath);
    const contents = `${JSON.stringify({ ...message, acceptedAt })}\n`;

    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(filePath, contents, { encoding: 'utf8', flag: 'w' });
      this.logger(url);
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
}

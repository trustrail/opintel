import { createHash } from 'node:crypto';
import { CompanyView } from '../../../shared/api/tenancy-schemas.js';
import { withPlatform } from '../../../platform/db/scope.js';
import { CompanyId, DomainError, Timestamp, err, ok, IndustryId, type Region, type UserId } from '../../../shared/kernel/index.js';
import type { CompanyCreationRepository, CreateCompanyInput } from '../application/create-company.js';
import type { RelationshipOutbox } from '../application/relationship-outbox.js';

export class PostgresCompanyCreationRepository implements CompanyCreationRepository {
  constructor(private readonly outbox: RelationshipOutbox) {}

  async create(input: CreateCompanyInput, creator: UserId, requestKey: string): ReturnType<CompanyCreationRepository['create']> {
    const hash = createHash('sha256').update(JSON.stringify([input.name,input.defaultRegion,input.defaultIndustryId])).digest('hex');
    return withPlatform(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['company-create',creator,requestKey])]);
      const [prior] = await tx.query<{body_hash:string;response:unknown;outbox_id:string}>(
        "SELECT body_hash,response,outbox_id FROM company_creation_request WHERE actor_id=$1 AND route='/api/v1/companies' AND request_key=$2 AND expires_at>clock_timestamp()",[creator,requestKey]);
      if (prior) {
        if (prior.body_hash !== hash) return err(new DomainError('idempotency_key_reused','This Idempotency-Key was used with a different company creation request.'));
        const value=CompanyView.parse(prior.response);
        return ok({company:{...value,id:CompanyId(value.id),defaultIndustryId:value.defaultIndustryId===null?null:IndustryId(value.defaultIndustryId),createdAt:Timestamp(new Date(value.createdAt))},outboxId:BigInt(prior.outbox_id)});
      }
      if (input.defaultIndustryId !== null) {
        const industries = await tx.query<{ id: string }>(
          'SELECT id FROM industry WHERE id = $1', [input.defaultIndustryId],
        );
        if (industries.length === 0) {
          return err(new DomainError('validation_failed', 'The selected default industry does not exist.'));
        }
      }

      const rows = await tx.query<{ id: string; name: string; default_region: Region; created_at: Date }>(
        `INSERT INTO company (name, default_region, default_industry_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, default_region, created_at`,
        [input.name, input.defaultRegion, input.defaultIndustryId],
      );
      const row = rows[0];
      if (row === undefined) throw new Error('Company was not created.');
      const company = {
        id: CompanyId(row.id), name: row.name, defaultRegion: row.default_region,
        defaultIndustryId: input.defaultIndustryId, createdAt: Timestamp(row.created_at),
      };
      await tx.query(
        `INSERT INTO company_member (company_id, user_id, role, granted_by)
         VALUES ($1, $2, 'admin', $2)`,
        [company.id, creator],
      );
      const outboxId = await this.outbox.enqueue(tx, {
        operation: 'touch', resource: { type: 'company', id: company.id },
        relation: 'admin', subject: { type: 'user', id: creator },
      });
      await tx.query(`INSERT INTO company_creation_request(actor_id,route,request_key,body_hash,response,company_id,outbox_id,expires_at)
        VALUES($1,'/api/v1/companies',$2,$3,$4::jsonb,$5,$6,clock_timestamp()+interval '24 hours')
        ON CONFLICT(actor_id,route,request_key) DO UPDATE SET body_hash=EXCLUDED.body_hash,response=EXCLUDED.response,
          company_id=EXCLUDED.company_id,outbox_id=EXCLUDED.outbox_id,expires_at=EXCLUDED.expires_at`,
        [creator,requestKey,hash,JSON.stringify(company),company.id,outboxId.toString()]);
      return ok({ company, outboxId });
    });
  }
  async dispatched(outboxId: bigint): Promise<boolean> {
    // Wait for a concurrent dispatcher before deciding whether the grant exists.
    return withPlatform(async tx => {
      const [entry]=await tx.query<{written_at:Date|null}>('SELECT written_at FROM relationship_outbox WHERE id=$1 FOR UPDATE',[outboxId.toString()]);
      return entry?.written_at != null;
    });
  }
}

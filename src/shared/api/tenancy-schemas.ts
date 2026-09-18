import { z } from 'zod';

export const RegionSchema = z.enum(['eu-west-1', 'us-east-1', 'ap-southeast-1', 'ap-southeast-3']);


export const CreateCompanyBody = z.object({
  name: z.string().min(1).max(120),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
});

export const CompanyView = z.object({
  id: z.string().uuid(),
  name: z.string(),
  defaultRegion: RegionSchema,
  defaultIndustryId: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});



export const CreateProjectBody = z.object({
  companyId: z.string().uuid(),
  name: z.string().min(1).max(80),
  industryId: z.string().uuid(),
  region: RegionSchema,
});

export const ProjectView = z.object({
  id: z.string().uuid(), companyId: z.string().uuid(), name: z.string(),
  industry: z.object({ id: z.string().uuid(), name: z.string(), inheritedTermCount: z.number().int() }),
  region: RegionSchema,
  createdAt: z.string().datetime({ offset: true }),
});

export const UpdateProjectBody = z.object({ name: z.string().min(1).max(80) });

export const MigrateIndustryBody = z.object({
  industryId: z.string().uuid(), confirmation: z.string(),
});
const MigrationIndustry = z.object({ id: z.string().uuid(), name: z.string(), termCount: z.number().int() });
export const MigrateIndustryPreview = z.object({
  from: MigrationIndustry, to: MigrationIndustry,
  shadowedTerms: z.array(z.object({ name: z.string(), kind: z.string() })),
  projectTermsRetained: z.number().int(), entitlementsAffected: z.literal(0),
  confirmationPhrase: z.string(),
});


export const ProjectListItem = z.object({
  id: z.string().uuid(), name: z.string(),
  region: RegionSchema,
  company: z.object({ id: z.string().uuid(), name: z.string() }),
  industry: z.object({ id: z.string().uuid(), name: z.string() }),
  role: z.enum(['admin', 'operator', 'viewer']),
  archivedAt: z.string().datetime({ offset: true }).nullable().optional(),
});
export const ProjectListResponse = z.object({ items: z.array(ProjectListItem), nextCursor: z.string().nullable() });
export const CompanyListItem = z.object({
  id: z.string().uuid(), name: z.string(), role: z.enum(['admin', 'member']), projectCount: z.number().int(),
});
export const CompanyListResponse = z.object({ items: z.array(CompanyListItem), nextCursor: z.string().nullable() });


export const IndustryListItem = z.object({
  id: z.string().uuid(), slug: z.string(), name: z.string(), description: z.string().nullable(),
  inheritedTermCount: z.number().int(), hasDemoPack: z.boolean(),
});
export const IndustryListResponse = z.array(IndustryListItem);

export const PermissionExplanation = z.object({
  permission: z.string(), allowed: z.boolean(), path: z.array(z.string()),
  via: z.enum(['project', 'company', 'none']),
});
export const ExplainResponse = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string() }),
  projectRole: z.enum(['admin', 'operator', 'viewer']).nullable(),
  companyRole: z.enum(['admin', 'member']).nullable(),
  permissions: z.array(PermissionExplanation),
  checkedAt: z.string().datetime({ offset: true }), token: z.string(),
});

export const ProjectMemberListItem = z.object({
  user: z.object({ id: z.string().uuid(), email: z.string(), fullName: z.string().nullable() }),
  projectRole: z.enum(['admin', 'operator', 'viewer']).nullable(),
  companyRole: z.enum(['admin', 'member']).nullable(),
  via: z.enum(['project', 'company', 'both']),
  grantedAt: z.string().datetime({ offset: true }).nullable(),
  grantedBy: z.object({ id: z.string().uuid(), email: z.string() }).nullable(),
});
export const ProjectMemberListResponse = z.object({ items: z.array(ProjectMemberListItem), nextCursor: z.string().nullable() });

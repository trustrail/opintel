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

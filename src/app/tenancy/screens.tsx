import { CustodyObservations } from '../custody/observations.js';
import { QuarantineFeed } from '../filings/screens.js';
import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { type FormEvent, type ReactNode } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingState } from '../../shared/ui/index.js';
import { CreateCompanyBody, CreateProjectBody, RegionSchema } from '../../shared/api/tenancy-schemas.js';
import { useCompanies, useCreateCompany, useCreateProject, useIndustries, useProjects, type IndustryItem } from './data.js';
import { useCompanyForm, useProjectForm } from './state.js';

export function projectIdFromPath(path: string): string | null {
  const match = /^\/projects\/([^/]+)\//u.exec(path);
  return match?.[1] ?? null;
}

export function ProjectChooser(): ReactNode {
  const projects = useProjects();
  const companies = useCompanies();
  const admin = companies.data?.some((company) => company.role === 'admin') ?? false;
  const error = projects.error ?? companies.error;
  return <section className="screen on"><h1>Your projects</h1><p className="sub">Choose a project to work with its data, permissions and evidence.</p>
    {error !== null ? <ErrorState title="Projects could not be loaded" description={error.message} retry={() => { void projects.refetch(); void companies.refetch(); }} />
      : projects.isPending || companies.isPending ? <LoadingState /> : <>
        <div className="pgrow" style={{ marginBottom: 14 }}><Link className="btn go" to={admin ? '/projects/new' : '/companies/new'}>{admin ? 'Create project' : 'Create company'}</Link>{admin ? <Link className="btn ghost" to="/companies/new">Create company</Link> : null}</div>
        {(projects.data ?? []).length === 0 ? <EmptyState icon="◫" title="No projects yet" description={admin ? 'Create a project to choose an industry and region, then connect your first source.' : 'Create a company first. You will become its administrator and can create a project.'} />
          : <div className="pgrid">{(projects.data ?? []).map((project) => <Link className="pcard" key={project.id} to="/projects/$projectId/dashboard" params={{ projectId: project.id }} aria-labelledby={`project-${project.id}`} style={{ color: 'inherit', textDecoration: 'none', padding: 12, alignSelf: 'start' }}>
            <div className="ph2" style={{ marginBottom: 6 }}><span className="sq" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span><div><h4 id={`project-${project.id}`} aria-level={2}>{project.name}</h4><span className="co2">{project.company.name}</span></div></div>
            <div className="pbarleg" style={{ marginTop: 0 }}>{project.industry.name} · {project.region} · {project.role}</div>
          </Link>)}</div>}
      </>}
  </section>;
}

function RegionPicker({ value, onChange }: { value: string; onChange(value: string): void }): ReactNode {
  return <div className="fld"><span className="pick"><label htmlFor="creation-region">Region</label><select id="creation-region" required value={value} onChange={(event) => onChange(event.target.value)} aria-describedby="region-note"><option value="">Choose a region</option>{RegionSchema.options.map((region) => <option value={region} key={region}>{region}</option>)}</select></span><p className="hint" id="region-note">A project's region is fixed at creation and cannot be changed later.</p></div>;
}

function IndustryPicker({ items, value, onChange, optional = false }: { items: IndustryItem[]; value: string; onChange(value: string): void; optional?: boolean }): ReactNode {
  return <fieldset className="card"><legend>Industry{optional ? ' default (optional)' : ''}</legend><p className="sub">Your project inherits this industry's vocabulary by reference.</p><div className="enrolopts">
    {optional ? <label className="dcard"><span><input type="radio" name="industry" value="" checked={value === ''} onChange={() => onChange('')} /> No default industry</span></label> : null}
    {items.map((industry) => <label className="dcard" key={industry.id}><span><input type="radio" name="industry" required={!optional} checked={value === industry.id} onChange={() => onChange(industry.id)} value={industry.id} /> <b>{industry.name}</b></span>{industry.description === null ? null : <span className="d">{industry.description}</span>}<span className="mono">{industry.inheritedTermCount} inherited terms</span><span className="d">{industry.hasDemoPack ? 'Demo pack available for evaluation without a database.' : 'No demo pack. Connect your own database when you are ready.'}</span></label>)}
  </div></fieldset>;
}

export function CreateProjectScreen(): ReactNode {
  const companies = useCompanies();
  const industries = useIndustries();
  const form = useProjectForm();
  const mutation = useCreateProject();
  const navigate = useNavigate();
  const admins = companies.data?.filter((company) => company.role === 'admin') ?? [];
  const companyId = admins.some((company) => company.id === form.companyId) ? form.companyId : admins.length === 1 ? admins[0]?.id ?? '' : '';
  const error = companies.error ?? industries.error;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = CreateProjectBody.safeParse({ name: form.name, companyId, industryId: form.industryId, region: form.region });
    if (!parsed.success || mutation.isPending) return;
    try {
      const project = await mutation.mutateAsync(parsed.data);
      form.reset();
      await navigate({ to: '/projects/$projectId/dashboard', params: { projectId: project.id } });
    } catch { /* Keep every entered value; the server message appears below. */ }
  };
  return <section className="screen on"><h1>Create project</h1><p className="sub">Choose the company, vocabulary and region for this project's data.</p>
    {error !== null ? <ErrorState title="Project options could not be loaded" description={error.message} retry={() => { void companies.refetch(); void industries.refetch(); }} />
      : companies.isPending || industries.isPending ? <LoadingState />
        : admins.length === 0 ? <EmptyState icon="◫" title="Create a company first" description="You need to administer a company to create a project. Create your own company, or ask a company administrator for access."><Link className="btn go" to="/companies/new">Create company</Link></EmptyState>
          : (industries.data ?? []).length === 0 ? <EmptyState icon="❋" title="No industries available" description="An industry pack must be published before you can create a project. Ask your platform administrator, then refresh."><Button onClick={() => { void industries.refetch(); }}>Refresh industries</Button></EmptyState>
            : <Card><form className="sheetb" onSubmit={submit} aria-busy={mutation.isPending}>
              <div className="fld"><label htmlFor="project-name">Project name</label><input id="project-name" required maxLength={80} value={form.name} onChange={(event) => form.set({ name: event.target.value })} autoComplete="off" /></div>
              <div className="fld">{admins.length === 1 && !form.changeCompany ? <><p>Company: <b>{admins[0]?.name}</b></p><Button variant="ghost" onClick={() => form.set({ changeCompany: true })}>Change company</Button></> : <span className="pick"><label htmlFor="project-company">Company</label><select id="project-company" required value={companyId} onChange={(event) => form.set({ companyId: event.target.value })}><option value="">Choose a company</option>{admins.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></span>}</div>
              <RegionPicker value={form.region} onChange={(region) => form.set({ region })} />
              <IndustryPicker items={industries.data ?? []} value={form.industryId} onChange={(industryId) => form.set({ industryId })} />
              {mutation.error === null ? null : <div className="fld err" role="alert"><p className="err-msg">{mutation.error.message}</p></div>}
              <div className="pgrow"><Button variant="go" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Creating project…' : 'Create project'}</Button><Link className="btn ghost" to="/projects">Cancel</Link></div>
            </form></Card>}
  </section>;
}

export function CreateCompanyScreen(): ReactNode {
  const industries = useIndustries();
  const form = useCompanyForm();
  const mutation = useCreateCompany();
  const navigate = useNavigate();
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = CreateCompanyBody.safeParse({ name: form.name, defaultRegion: form.region, defaultIndustryId: form.industryId || null });
    if (!parsed.success || mutation.isPending) return;
    try {
      const company = await mutation.mutateAsync(parsed.data);
      useProjectForm.getState().set({ companyId: company.id, region: company.defaultRegion, industryId: company.defaultIndustryId ?? '' });
      form.reset();
      await navigate({ to: '/projects/new' });
    } catch { /* Preserve the form when creation is refused. */ }
  };
  return <section className="screen on"><h1>Create company</h1><p className="sub">You will be its administrator. Next, create a project inside the company.</p>
    {industries.isError ? <ErrorState title="Industries could not be loaded" description={industries.error.message} retry={() => { void industries.refetch(); }} /> : industries.isPending ? <LoadingState />
      : <Card><form className="sheetb" onSubmit={submit} aria-busy={mutation.isPending}><div className="fld"><label htmlFor="company-name">Company name</label><input id="company-name" required maxLength={120} value={form.name} onChange={(event) => form.set({ name: event.target.value })} autoComplete="organization" /></div>
        <RegionPicker value={form.region} onChange={(region) => form.set({ region })} />
        {(industries.data ?? []).length === 0 ? <p className="note">No industry packs are available yet. You can create a company without a default industry.</p> : <IndustryPicker optional items={industries.data ?? []} value={form.industryId} onChange={(industryId) => form.set({ industryId })} />}
        {mutation.error === null ? null : <div className="fld err" role="alert"><p className="err-msg">{mutation.error.message}</p></div>}
        <div className="pgrow"><Button type="submit" variant="go" disabled={mutation.isPending}>{mutation.isPending ? 'Creating company…' : 'Create company'}</Button><Link className="btn ghost" to="/projects">Cancel</Link></div>
      </form></Card>}
  </section>;
}

export function ProjectDashboard(): ReactNode {
  const path = useRouterState({ select: (state) => state.location.pathname });
  const id = projectIdFromPath(path);
  const projects = useProjects();
  if (projects.isPending) return <LoadingState />;
  if (projects.isError) return <ErrorState title="Project could not be loaded" description={projects.error.message} retry={() => { void projects.refetch(); }} />;
  const project = projects.data.find((item) => item.id === id);
  if (project === undefined) return <EmptyState icon="◫" title="Project unavailable" description="Choose a project you can reach."><Link className="btn go" to="/projects">View projects</Link></EmptyState>;
  return <section className="screen on"><h1>{project.name}</h1><p className="sub">Three steps to set up your project.</p><div className="setup">
    <div className="stepcard now"><div className="num">1</div><b>Connect a source</b><p>Opintel introspects it and builds a catalogue. Nothing is readable until you say so.</p><Link className="btn go" to="/projects/$projectId/$screen" params={{ projectId: project.id, screen: 'data-sources' }}>Connect a source</Link></div>
    <div className="stepcard"><div className="num">2</div><b>Create a pool</b><p>Generate a key for your agents. Bind the pool to the sources it may reach.</p><Link className="btn ghost" to="/projects/$projectId/$screen" params={{ projectId: project.id, screen: 'pools' }}>Create a pool</Link></div>
    <div className="stepcard"><div className="num">3</div><b>Decide what it sees</b><p>Set entitlements for the pool. Anything undecided stays out of reach.</p><Link className="btn ghost" to="/projects/$projectId/$screen" params={{ projectId: project.id, screen: 'entitlements' }}>Open entitlements</Link></div>
  </div><QuarantineFeed projectId={project.id}/><CustodyObservations projectId={project.id}/></section>;
}

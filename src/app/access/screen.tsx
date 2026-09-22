import { Link, useNavigate } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { Button, EmptyState, ErrorState, LoadingState } from '../../shared/ui/index.js';
import { projectKeys, useProjects } from '../tenancy/data.js';
import { useMembers, usePermissionExplanation, type Member } from './data.js';
import { useAccessUi } from './state.js';

const permissionLabels: Record<string, string> = {
  administer: 'Administer project', set_entitlement: 'Set entitlements', map_term: 'Map terms',
  bind_source: 'Bind sources', view_unredacted: 'View unredacted arguments', archive: 'Archive project',
  export_evidence: 'Export evidence', simulate: 'Simulate', ack_observation: 'Acknowledge observations', view: 'View project',
};
const roleLabels = { admin: 'Admin', operator: 'Operator', viewer: 'Viewer' };
const viaLabels = { project: 'Direct project grant', company: 'Company inheritance', both: 'Direct grant + company inheritance' };

function Derivation({ projectId, member, company }: { projectId: string; member: Member; company: string }): ReactNode {
  const explanation = usePermissionExplanation(projectId, member.user.id);
  if (explanation.isPending) return <LoadingState />;
  if (explanation.isError) return <ErrorState title="Permissions could not be loaded" description={explanation.error.message} retry={() => { void explanation.refetch(); }} />;
  if (explanation.data.permissions.length === 0) return <EmptyState icon="◉" title="No permission results" description="Refresh permissions to check this person's current access."><Button onClick={() => { void explanation.refetch(); }}>Refresh permissions</Button></EmptyState>;
  const groups = [
    { key: 'project', title: 'Allowed · Direct project grant' },
    { key: 'company', title: `Allowed · Inherited from ${company}` },
    { key: 'none', title: 'Allowed' },
    { key: 'denied', title: 'Not allowed' },
  ] as const;
  return <>
    <div className="seg"><h3 className="seglab">Why this person has access</h3>
      <p className="note">{member.via === 'project' ? 'Access was granted directly on this project.' : member.via === 'company' ? `Access is inherited from ${company}. There is no grant on this project.` : `Access comes from a direct project grant and membership of ${company}. Removing the project grant would not remove company access.`}</p>
      {member.grantedAt === null ? null : <p className="note">Project grant: <time dateTime={member.grantedAt}>{member.grantedAt.slice(0, 10)}</time>{member.grantedBy === null ? '' : ` by ${member.grantedBy.email}`}.</p>}
    </div>
    {groups.map((group) => {
      const permissions = explanation.data.permissions.filter((permission) => (permission.allowed ? permission.via : 'denied') === group.key);
      return permissions.length === 0 ? null : <section className="seg" key={group.key} aria-label={group.title}>
        <h3 className="seglab">{group.title}</h3><div className="caps">{permissions.map((permission) => <span className={permission.allowed ? 'cap' : 'cap no'} key={permission.permission}>{permissionLabels[permission.permission] ?? permission.permission}</span>)}</div>
      </section>;
    })}
    {member.projectRole === 'operator' && member.companyRole !== 'admin' ? <p className="note">Operators keep agents running without widening what they see. They can export evidence and simulate, but cannot set entitlements, bind sources or map terms.</p> : null}
    <p className="note">Checked <time dateTime={explanation.data.checkedAt}>{explanation.data.checkedAt}</time></p>
    <details className="seg"><summary>SpiceDB trace</summary><p className="note">Supplementary detail. Cached checks may return a shorter trace or no trace.</p>
      {explanation.data.permissions.map((permission) => <div className="seg" key={permission.permission}><h4 className="seglab">{permissionLabels[permission.permission] ?? permission.permission}</h4>
        <div className="deriv" style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{permission.path.length === 0 ? 'No additional trace detail returned.' : permission.path.join('\n')}</div>
      </div>)}
      <p className="note" style={{ overflowWrap: 'anywhere' }}>Revision: {explanation.data.token}</p>
    </details>
  </>;
}

export function AccessScreen({ projectId }: { projectId: string }): ReactNode {
  const projects = useProjects();
  const members = useMembers(projectId);
  const ui = useAccessUi();
  const navigate = useNavigate();
  const cache = useQueryClient();
  const project = projects.data?.find((item) => item.id === projectId);
  const company = project?.company.name ?? 'the company';
  const selected = ui.projectId === projectId ? ui.selectedId : null;
  const filter = ui.projectId === projectId ? ui.filter : 'all';
  const visible = members.data?.filter((member) => filter === 'all' || member.via === filter || member.via === 'both') ?? [];
  return <section className="screen on"><h1>Access</h1><p className="sub">Who can reach this project and what each person may do. Select someone to see their permissions and why they have them.</p>
    {project?.role==='admin'?<p className="note"><Link to="/projects/$projectId/$screen" params={{projectId,screen:'token-key'}}>Manage token key</Link></p>:null}
    <div className="filters"><span className="pick"><label htmlFor="access-project">Project</label><select id="access-project" value={projectId} onChange={(event) => {
      const nextId = event.target.value;
      cache.removeQueries({ queryKey: projectKeys.scope(projectId) });
      ui.show(nextId, 'all');
      void navigate({ to: '/projects/$projectId/$screen', params: { projectId: nextId, screen: 'access' } });
    }}>{project === undefined ? <option value={projectId}>{projects.isPending ? 'Loading projects…' : 'Current project'}</option> : null}{projects.data?.map((item) => <option key={item.id} value={item.id}>{item.company.name} / {item.name}</option>)}</select></span>
      <span className="pick"><label htmlFor="access-filter">Show</label><select id="access-filter" value={filter} onChange={(event) => { const value = event.target.value; if (value === 'all' || value === 'project' || value === 'company') ui.show(projectId, value); }}><option value="all">Everyone with access</option><option value="project">Direct grants</option><option value="company">Inherited access</option></select></span>
    </div>
    {projects.isError ? <ErrorState title="Projects could not be loaded" description={projects.error.message} retry={() => { void projects.refetch(); }} /> : null}
    {members.isPending ? <LoadingState /> : members.isError ? <ErrorState title="Members could not be loaded" description={members.error.message} retry={() => { void members.refetch(); }} />
      : members.data.length === 0 ? <EmptyState icon="◉" title="No members found" description="Ask a company administrator to review membership, then refresh this list."><Button onClick={() => { void members.refetch(); }}>Refresh members</Button></EmptyState>
        : visible.length === 0 ? <EmptyState icon="◉" title="No members match this filter" description="Show everyone to review all direct and inherited access."><Button onClick={() => ui.show(projectId, 'all')}>Show everyone</Button></EmptyState>
          : <div className="card"><div className="card-h"><h2>People who can reach {project?.name ?? 'this project'}</h2><span className="meta">{visible.length} people · {visible.filter((member) => member.via !== 'project').length} with inheritance</span></div>
            {visible.map((member) => {
              const expanded = selected === member.user.id;
              const role = member.projectRole ?? (member.companyRole === 'admin' ? 'admin' : 'viewer');
              const name = member.user.fullName ?? member.user.email;
              return <div className={expanded ? 'who open' : 'who'} key={member.user.id}>
                <button type="button" className="wh" aria-expanded={expanded} aria-controls={`permissions-${member.user.id}`} onClick={() => ui.select(projectId, member.user.id)} style={{ width: '100%', border: 0, textAlign: 'left', color: 'inherit', background: expanded ? 'var(--surface-2)' : 'var(--surface)' }}>
                  <span className="wav" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span><span className="wb" style={{ overflowWrap: 'anywhere' }}><b>{name}</b><span>{member.user.email}</span></span>
                  <span className="wrole"><span className={role === 'admin' ? 'rl admin' : role === 'operator' ? 'rl op' : 'rl view'}>{roleLabels[role]}{member.via === 'both' ? ' on project' : ''}</span><span className={member.via === 'project' ? 'src' : 'src inh'}>{viaLabels[member.via]}</span>{member.companyRole === null ? null : <span className="src inh">{member.companyRole === 'admin' ? 'Admin' : 'Member'} of {company}</span>}</span>
                </button>
                <div className="wdet" id={`permissions-${member.user.id}`} role="region" aria-label={`Permissions for ${name}`}>{expanded ? <Derivation projectId={projectId} member={member} company={company} /> : null}</div>
              </div>;
            })}
          </div>}
  </section>;
}

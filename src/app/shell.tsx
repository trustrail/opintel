import { useIntrospection } from './introspection/data.js';
import { useProjectStream } from './project-stream.js';
import { Link, Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useRef, useSyncExternalStore, type ReactNode } from 'react';
import { AppRoot } from '../shared/ui/index.js';
import { labelForPath, navGroups, type NavPath } from './navigation.js';
import { ToastHost } from './toast.js';
import { projectKeys, useProjects } from './tenancy/data.js';
import { projectIdFromPath } from './tenancy/screens.js';
import { useShellUi } from './tenancy/state.js';

function Drawer(): ReactNode {
  const navigate = useNavigate();
  const cache = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const id = projectIdFromPath(pathname);
  const projects = useProjects();
  const active = projects.data?.find((project) => project.id === id);
  const ui = useShellUi();
  const context = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (event.target instanceof Node && !context.current?.contains(event.target)) ui.open(false); };
    document.addEventListener('click', outside);
    return () => document.removeEventListener('click', outside);
  }, [ui.open]);
  const switchProject = (nextId: string): void => {
    if (id !== null && id !== nextId) cache.removeQueries({ queryKey: projectKeys.scope(id) });
    ui.open(false);
    void navigate({ to: '/projects/$projectId/dashboard', params: { projectId: nextId } });
  };
  const go = (path: NavPath): void => {
    if (path === '/projects' || id === null) { void navigate({ to: '/projects' }); return; }
    void navigate({ to: '/projects/$projectId/$screen', params: { projectId: id, screen: path.slice(1) } });
  };
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow);
  const section = pathname.split('/')[3];
  const activePath = id === null ? pathname : section === 'token-key' ? '/access' : ['sources','introspections','catalog'].includes(section ?? '') ? '/data-sources' : `/${section ?? 'dashboard'}`;
  return <aside className="drawer" id="application-drawer">
    <div className="dhead"><img className="logo" src="/opintel-logo.png" srcSet="/opintel-logo@2x.png 2x, /opintel-logo@3x.png 3x" alt="Opintel" /><span className="nm">Opintel</span><button aria-controls="application-drawer" aria-expanded={!ui.collapsed} className="dtoggle" aria-label={ui.collapsed ? 'Expand menu' : 'Collapse menu'} onClick={ui.toggle}>‹</button></div>
    <div className="ctx" ref={context} onKeyDown={(event) => { if (event.key === 'Escape') { ui.open(false); trigger.current?.focus(); } }}><div className="ctxlabel" style={{ color: 'var(--rule-2)' }}>Project</div><button ref={trigger} className="projbtn" type="button" aria-label={active === undefined ? 'Choose a project' : `Switch project: ${active.name}`} aria-expanded={ui.switcherOpen} aria-controls="project-switcher" onClick={() => ui.open(!ui.switcherOpen)}><span className="sq" aria-hidden="true">{active?.name.slice(0, 2).toUpperCase() ?? '◫'}</span><span className="tx"><b>{active?.name ?? 'Choose a project'}</b><span>{active?.company.name ?? 'Your workspace'}</span></span><span className="cv" aria-hidden="true">▾</span></button>
      <div className={ui.switcherOpen ? 'projmenu on' : 'projmenu'} id="project-switcher">
        {projects.isPending ? <p className="pmgroup">Loading projects…</p> : projects.isError ? <><p className="pmgroup">{projects.error.message}</p><button className="pmfoot" onClick={() => { void projects.refetch(); }}>Try again</button></> : projects.data.length === 0 ? <p className="pmgroup">No projects yet</p> : projects.data.map((project) => <button className="pmitem" key={project.id} aria-current={id === project.id || undefined} onClick={() => switchProject(project.id)}><span className="sq" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span><span className="tx"><b>{project.name}</b><span>{project.company.name} · {project.role}</span></span></button>)}
        <div className="pmsep" /><button className="pmfoot" onClick={() => { ui.open(false); void navigate({ to: '/projects' }); }}>View all projects</button><button className="pmfoot" onClick={() => { ui.open(false); void navigate({ to: '/projects/new' }); }}>New project</button>
      </div>
    </div>
    <nav className="dnav" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><div className="dgroup" style={{ color: 'var(--rule-2)' }}>{group.label}</div>{group.items.map((item) => {
      const children = id === null ? [] : item.children?.filter(child => !child.adminOnly || active?.role === 'admin') ?? [];
      const selected = activePath === item.path;
      const expanded = (ui.sections[item.path] ?? selected) && !ui.collapsed && !narrow && id !== null;
      const navigation = <button aria-label={item.label} data-active={selected || undefined} aria-current={selected && !['catalog','token-key','sources','introspections'].includes(section ?? '') ? 'page' : undefined} onClick={() => go(item.path)} type="button"><span className="ic" aria-hidden="true">{item.icon}</span><span className="lb">{item.label}</span></button>;
      return <Fragment key={item.path}>{children.length && !ui.collapsed && !narrow ? <div data-nav-row="true" data-active={selected || undefined}>{navigation}<button type="button" data-disclosure="true" aria-label={`${expanded ? 'Hide' : 'Show'} sub-items of ${item.label}`} aria-expanded={expanded} aria-controls={`nav-${item.path.slice(1)}`} onClick={() => ui.toggleSection(item.path,expanded)}><span aria-hidden="true">›</span></button></div> : navigation}
      {children.length ? <ul id={`nav-${item.path.slice(1)}`} hidden={!expanded}>{children.map(child => <li key={child.screen}><Link to="/projects/$projectId/$screen" params={{projectId:id ?? '',screen:child.screen}} aria-current={section === child.screen ? 'page' : undefined}>{child.label}</Link></li>)}</ul> : null}</Fragment>;
    })}</div>)}</nav>
    <div className="dfoot"><button className="acct" type="button" aria-label="Your account"><span className="av" aria-hidden="true">U</span><span className="tx"><b>Your account</b><span>{active?.role ?? 'Signed in'}</span></span></button></div>
  </aside>;
}

const isNarrow = () => window.matchMedia('(max-width: 820px)').matches;
const subscribeNarrow = (notify: () => void) => {
  const media = window.matchMedia('(max-width: 820px)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

function TopBar(): ReactNode {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projects = useProjects();
  const project = projects.data?.find((item) => item.id === projectIdFromPath(pathname));
  const section = pathname.split('/')[3];
  const runId = section === 'introspections' ? pathname.split('/')[4] : undefined;
  const run = useIntrospection(project?.id ?? '',runId ?? '',Boolean(project && runId));
  const crumbs: {label:string; to:string; companyId?:string}[] = project ? [
    {label:project.company.name,to:'/projects',companyId:project.company.id},
    {label:project.name,to:`/projects/${project.id}/dashboard`},
  ] : pathname === '/projects' ? [] : [{label:'All projects',to:'/projects'}];
  if(project && ['catalog','sources','introspections'].includes(section ?? '')) crumbs.push({label:'Data sources',to:`/projects/${project.id}/data-sources`});
  if(project && section === 'token-key') crumbs.push({label:'Access',to:`/projects/${project.id}/access`});
  if(project && runId && run.data) crumbs.push({label:'Introspection runs',to:`/projects/${project.id}/sources/${run.data.sourceId}/introspections`});
  crumbs.push({label:labelForPath(pathname),to:pathname});
  return <header className="top"><nav className="crumbs" aria-label="Breadcrumb"><ol>{crumbs.map((crumb,index) => <li key={`${index}-${crumb.to}`}>
    {index > 0 ? <span className="sl" aria-hidden="true">/</span> : null}
    {index === crumbs.length-1 ? <span className="cur" aria-current="page">{crumb.label}</span> : <Link to={crumb.to} search={crumb.companyId ? {companyId:crumb.companyId} : {}}>{crumb.label}</Link>}
  </li>)}</ol></nav><span className="search"><span aria-hidden="true">⌕</span><input aria-label="Search this project" placeholder="Search this project" disabled={project === undefined} /><span className="k">⌘K</span></span><button className="iconbtn" title="Notifications" type="button">◔</button><button className="iconbtn" title="Help" type="button">?</button><button className="av" aria-label="Account menu" type="button">U</button></header>;
}

export function AppShell(): ReactNode {
  const pathname = useRouterState({ select: state => state.location.pathname });
  useProjectStream(projectIdFromPath(pathname));
  const collapsed = useShellUi((state) => state.collapsed);
  return <AppRoot><ToastHost><div className={collapsed ? 'shell collapsed' : 'shell'}><Drawer /><div className="main"><TopBar /><main className="body"><Outlet /></main></div></div></ToastHost></AppRoot>;
}

import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type ReactNode } from 'react';
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
  const section = pathname.split('/')[3];
  const activePath = id === null ? pathname : ['sources','introspections'].includes(section ?? '') ? '/data-sources' : `/${section ?? 'dashboard'}`;
  return <aside className="drawer" id="application-drawer">
    <div className="dhead"><img className="logo" src="/opintel-logo.png" srcSet="/opintel-logo@2x.png 2x, /opintel-logo@3x.png 3x" alt="Opintel" /><span className="nm">Opintel</span><button aria-controls="application-drawer" aria-expanded={!ui.collapsed} className="dtoggle" aria-label={ui.collapsed ? 'Expand menu' : 'Collapse menu'} onClick={ui.toggle}>‹</button></div>
    <div className="ctx" ref={context} onKeyDown={(event) => { if (event.key === 'Escape') { ui.open(false); trigger.current?.focus(); } }}><div className="ctxlabel" style={{ color: 'var(--rule-2)' }}>Project</div><button ref={trigger} className="projbtn" type="button" aria-label={active === undefined ? 'Choose a project' : `Switch project: ${active.name}`} aria-expanded={ui.switcherOpen} aria-controls="project-switcher" onClick={() => ui.open(!ui.switcherOpen)}><span className="sq" aria-hidden="true">{active?.name.slice(0, 2).toUpperCase() ?? '◫'}</span><span className="tx"><b>{active?.name ?? 'Choose a project'}</b><span>{active?.company.name ?? 'Your workspace'}</span></span><span className="cv" aria-hidden="true">▾</span></button>
      <div className={ui.switcherOpen ? 'projmenu on' : 'projmenu'} id="project-switcher">
        {projects.isPending ? <p className="pmgroup">Loading projects…</p> : projects.isError ? <><p className="pmgroup">{projects.error.message}</p><button className="pmfoot" onClick={() => { void projects.refetch(); }}>Try again</button></> : projects.data.length === 0 ? <p className="pmgroup">No projects yet</p> : projects.data.map((project) => <button className="pmitem" key={project.id} aria-current={id === project.id || undefined} onClick={() => switchProject(project.id)}><span className="sq" aria-hidden="true">{project.name.slice(0, 2).toUpperCase()}</span><span className="tx"><b>{project.name}</b><span>{project.company.name} · {project.role}</span></span></button>)}
        <div className="pmsep" /><button className="pmfoot" onClick={() => { ui.open(false); void navigate({ to: '/projects' }); }}>View all projects</button><button className="pmfoot" onClick={() => { ui.open(false); void navigate({ to: '/projects/new' }); }}>New project</button>
      </div>
    </div>
    <nav className="dnav" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><div className="dgroup" style={{ color: 'var(--rule-2)' }}>{group.label}</div>{group.items.map((item) => <button aria-label={item.label} aria-current={activePath === item.path || undefined} key={item.path} onClick={() => go(item.path)} type="button"><span className="ic" aria-hidden="true">{item.icon}</span><span className="lb">{item.label}</span></button>)}</div>)}</nav>
    <div className="dfoot"><button className="acct" type="button" aria-label="Your account"><span className="av" aria-hidden="true">U</span><span className="tx"><b>Your account</b><span>{active?.role ?? 'Signed in'}</span></span></button></div>
  </aside>;
}

function TopBar(): ReactNode {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const projects = useProjects();
  const project = projects.data?.find((item) => item.id === projectIdFromPath(pathname));
  return <header className="top"><span className="crumbs">{project === undefined ? null : <><span className="co">{project.company.name}</span><span className="sl">/</span><span className="pr">{project.name}</span><span className="sl">/</span></>}<span className="cur">{labelForPath(pathname)}</span></span><span className="search"><span aria-hidden="true">⌕</span><input aria-label="Search this project" placeholder="Search this project" disabled={project === undefined} /><span className="k">⌘K</span></span><button className="iconbtn" title="Notifications" type="button">◔</button><button className="iconbtn" title="Help" type="button">?</button><button className="av" aria-label="Account menu" type="button">U</button></header>;
}

export function AppShell(): ReactNode {
  const collapsed = useShellUi((state) => state.collapsed);
  return <AppRoot><ToastHost><div className={collapsed ? 'shell collapsed' : 'shell'}><Drawer /><div className="main"><TopBar /><main className="body"><Outlet /></main></div></div></ToastHost></AppRoot>;
}

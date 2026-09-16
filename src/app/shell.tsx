import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { AppRoot } from '../shared/ui/index.js';
import { labelForPath, navGroups, type NavPath } from './navigation.js';
import { ToastHost } from './toast.js';

type DrawerProps = {
  readonly collapsed: boolean;
  readonly onToggle: () => void;
};

function Drawer({ collapsed, onToggle }: DrawerProps): ReactNode {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const activePath = pathname === '/' ? '/dashboard' : pathname;

  const go = (path: NavPath): void => { void navigate({ to: path }); };

  return <aside className="drawer" id="application-drawer">
    <div className="dhead"><img className="logo" src="/opintel-logo.png" srcSet="/opintel-logo@2x.png 2x, /opintel-logo@3x.png 3x" alt="Opintel" /><span className="nm">Opintel</span><button aria-controls="application-drawer" aria-expanded={!collapsed} className="dtoggle" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={onToggle}>‹</button></div>
    <div className="ctx"><div className="ctxlabel">Project</div><button className="projbtn" type="button"><span className="sq">FY</span><span className="tx"><b>Field Yield 2026</b><span>Northwind Foods</span></span><span className="cv">▾</span></button></div>
    <nav className="dnav" aria-label="Primary navigation">{navGroups.map((group) => <div key={group.label}><div className="dgroup">{group.label}</div>{group.items.map((item) => <button aria-current={activePath === item.path || undefined} key={item.path} onClick={() => go(item.path)} type="button"><span className="ic" aria-hidden="true">{item.icon}</span><span className="lb">{item.label}</span>{item.count === undefined ? null : <span className={item.dim ? 'pill dim' : 'pill'}>{item.count}</span>}</button>)}</div>)}</nav>
    <div className="dfoot"><button className="acct" type="button"><span className="av">DO</span><span className="tx"><b>Dara Okafor</b><span>Admin</span></span><span className="cv">▴</span></button></div>
  </aside>;
}

function TopBar(): ReactNode {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const title = labelForPath(pathname);
  return <header className="top"><span className="crumbs"><span className="co">Northwind Foods</span><span className="sl">/</span><span className="pr">Field Yield 2026</span><span className="sl">/</span><span className="cur">{title}</span></span><span className="search"><span aria-hidden="true">⌕</span><input aria-label="Search this project" placeholder="Search this project" /><span className="k">⌘K</span></span><button className="iconbtn" title="Notifications" type="button">◔<span className="dot" /></button><button className="iconbtn" title="Help" type="button">?</button><button className="av" aria-label="Account menu" type="button">DO</button></header>;
}

export function AppShell(): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = (): void => { setCollapsed((current) => !current); };
  return <AppRoot><ToastHost><div className={collapsed ? 'shell collapsed' : 'shell'}><Drawer collapsed={collapsed} onToggle={toggle} /><div className="main"><TopBar /><main className="body"><Outlet /></main></div></div></ToastHost></AppRoot>;
}

import type {MarkName} from '../shared/ui/index.js';
export type NavPath =
  | '/dashboard' | '/observations' | '/activity' | '/releases' | '/workbench'
  | '/data-sources' | '/vocabulary' | '/source-of-truth' | '/relationships' | '/knowledge'
  | '/entitlements' | '/pools' | '/access' | '/audit-log' | '/projects' | '/settings';

export type NavItem = {
  readonly label: string;
  readonly path: NavPath;
  readonly icon: MarkName;
  readonly count?: string;
  readonly dim?: boolean;
  readonly hidden?: boolean;
  readonly children?: readonly {label: string; screen: string; adminOnly?: boolean}[];
};

export type NavGroup = { readonly label: string; readonly items: readonly NavItem[] };

export const navGroups: readonly NavGroup[] = [
  { label: 'Watch', items: [
    { label: 'Dashboard', path: '/dashboard', icon: 'nav-dashboard' },
    { label: 'Observations', path: '/observations', icon: 'nav-observations' },
    { label: 'Activity', path: '/activity', icon: 'nav-activity' },
    { label: 'Releases', path: '/releases', icon: 'nav-releases' },
  ] },
  { label: 'Work', items: [{ label: 'Workbench', path: '/workbench', icon: 'nav-workbench' }] },
  { label: 'Understand', items: [
    { label: 'Data sources', path: '/data-sources', icon: 'nav-data-sources', children: [{label: 'Explore schema', screen: 'catalog'}, {label:'Suggestions',screen:'relationship-suggestions'}] },
    { label: 'Vocabulary', path: '/vocabulary', icon: 'nav-vocabulary' },
    { label: 'Source of truth', path: '/source-of-truth', icon: 'nav-source-of-truth' },
    { label: 'Relationships', path: '/relationships', icon: 'nav-relationships' },
    { label: 'Knowledge', path: '/knowledge', icon: 'nav-knowledge' },
  ] },
  { label: 'Govern', items: [
    { label: 'Entitlements', path: '/entitlements', icon: 'nav-entitlements' },
    { label: 'Pools', path: '/pools', icon: 'nav-pools' },
    { label: 'Access', path: '/access', icon: 'nav-access', children: [{label: 'Token key', screen: 'token-key', adminOnly: true}] },
    { label: 'Audit log', path: '/audit-log', icon: 'nav-audit-log', hidden: true },
  ] },
  { label: 'Manage', items: [
    { label: 'All projects', path: '/projects', icon: 'nav-all-projects' },
    { label: 'Settings', path: '/settings', icon: 'nav-settings', children:[{label:'Engines',screen:'settings-engines'},{label:'Discovery',screen:'settings-discovery'},{label:'Query',screen:'settings-query'},{label:'Evidence',screen:'settings-evidence'},{label:'Agents and keys',screen:'settings-agents'}] },
  ] },
];

export function labelForPath(pathname: string): string {
  if (/^\/projects\/[^/]+\/pools\/[^/]+\/agents\/[^/]+$/u.test(pathname)) return 'Agent twin';
  if (/^\/projects\/[^/]+\/pools\/[^/]+$/u.test(pathname)) return 'Pool detail';
  if (/^\/projects\/[^/]+\/introspections\/[^/]+$/u.test(pathname)) return 'Introspection run';
  if (/^\/projects\/[^/]+\/sources\/[^/]+\/introspections$/u.test(pathname)) return 'Introspection runs';
  if (/^\/projects\/[^/]+\/runs\/[^/]+$/u.test(pathname)) return 'Run record';
  if(pathname.startsWith('/settings-'))return ({'settings-engines':'Engines','settings-discovery':'Discovery','settings-query':'Query','settings-evidence':'Evidence','settings-agents':'Agents and keys'} as Record<string,string>)[pathname.slice(1)]??'Settings';
  if(/^\/companies\/[^/]+\/settings$/u.test(pathname))return 'Company settings';
  if (pathname === '/token-key') return 'Token key';
  if(pathname==='/relationship-suggestions')return 'Suggestions';
  if (pathname === '/catalog') return 'Explore schema';
  if (pathname === '/') return 'Dashboard';
  if (pathname === '/projects/new') return 'Create project';
  if (pathname === '/companies/new') return 'Create company';
  const projectScreen = /^\/projects\/[^/]+\/(.+)$/u.exec(pathname)?.[1];
  if (projectScreen !== undefined) return labelForPath(`/${projectScreen}`);
  for (const group of navGroups) {
    const match = group.items.find((item) => item.path === pathname);
    if (match !== undefined) return match.label;
  }
  return 'Not found';
}

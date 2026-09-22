export type NavPath =
  | '/dashboard' | '/observations' | '/activity' | '/releases' | '/workbench'
  | '/data-sources' | '/vocabulary' | '/source-of-truth' | '/relationships' | '/knowledge'
  | '/entitlements' | '/pools' | '/access' | '/audit-log' | '/projects' | '/settings';

export type NavItem = {
  readonly label: string;
  readonly path: NavPath;
  readonly icon: string;
  readonly count?: string;
  readonly dim?: boolean;
};

export type NavGroup = { readonly label: string; readonly items: readonly NavItem[] };

export const navGroups: readonly NavGroup[] = [
  { label: 'Watch', items: [
    { label: 'Dashboard', path: '/dashboard', icon: '◎' },
    { label: 'Observations', path: '/observations', icon: '▲' },
    { label: 'Activity', path: '/activity', icon: '≡' },
    { label: 'Releases', path: '/releases', icon: '⧉' },
  ] },
  { label: 'Work', items: [{ label: 'Workbench', path: '/workbench', icon: '▶' }] },
  { label: 'Understand', items: [
    { label: 'Data sources', path: '/data-sources', icon: '⛁' },
    { label: 'Vocabulary', path: '/vocabulary', icon: '❋' },
    { label: 'Source of truth', path: '/source-of-truth', icon: '◉' },
    { label: 'Relationships', path: '/relationships', icon: '⇄' },
    { label: 'Knowledge', path: '/knowledge', icon: '◈' },
  ] },
  { label: 'Govern', items: [
    { label: 'Entitlements', path: '/entitlements', icon: '⊟' },
    { label: 'Pools', path: '/pools', icon: '◇' },
    { label: 'Access', path: '/access', icon: '◉' },
    { label: 'Audit log', path: '/audit-log', icon: '⧉' },
  ] },
  { label: 'Manage', items: [
    { label: 'All projects', path: '/projects', icon: '◫' },
    { label: 'Settings', path: '/settings', icon: '⚙' },
  ] },
];

export function labelForPath(pathname: string): string {
  if (/^\/projects\/[^/]+\/introspections\/[^/]+$/u.test(pathname)) return 'Introspection run';
  if (/^\/projects\/[^/]+\/sources\/[^/]+\/introspections$/u.test(pathname)) return 'Introspection runs';
  if (pathname === '/token-key') return 'Token key';
  if (pathname === '/catalog') return 'Schema explorer';
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

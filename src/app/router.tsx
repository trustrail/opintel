import {EnginesScreen} from './engines/screen.js';
import {ProjectSettingsScreen,PersonalSettingsScreen,CompanySettingsScreen} from './settings/screens.js';
import {PoolsScreen,PoolDetailScreen,AgentTwinScreen} from './pools/screens.js';
import {ActivityScreen,RecordScreen} from './activity/screens.js';
import {ActivityFilters,DetailQuery} from '../shared/api/activity.js';
import { EntitlementsScreen } from './entitlements/screen.js';
import { z } from 'zod';
import { TokenKeyScreen } from './custody/screen.js';
import { IntrospectionListScreen, IntrospectionRunScreen } from './introspection/screens.js';
import { CatalogScreen } from './catalog/screen.js';
import { ObservationsScreen } from './filings/screens.js';
import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Navigate, Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RouteErrorBoundary } from './error-boundary.js';
import { navGroups, type NavItem } from './navigation.js';
import { AppShell } from './shell.js';
import { AuthCallbackScreen, CheckEmailScreen, ConfirmDeviceScreen, isAuthPath, SignInScreen } from './auth-screens.js';
import { SourcesScreen } from './sources/screen.js';
import { AccessScreen } from './access/screen.js';
import { AuthGuard } from './guard.js';
import { KitchenSinkScreen } from './kitchen-sink.js';
import { CreateCompanyScreen, CreateProjectScreen, ProjectChooser, ProjectDashboard } from './tenancy/screens.js';

function RouteScreen({ title }: { title: string }): ReactNode {
  return <RouteErrorBoundary><section className="screen on"><h1>{title}</h1></section></RouteErrorBoundary>;
}

function RootLayout(): ReactNode {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr });
  const hash = useRouterState({ select: (state) => state.location.hash });
  return isAuthPath(pathname) || (import.meta.env.DEV && pathname === '/dev/kitchen-sink') ? <Outlet /> : <AuthGuard intendedPath={`${pathname}${search}${hash}`}><AppShell /></AuthGuard>;
}

function AuthRoute({ children }: { readonly children: ReactNode }): ReactNode {
  return <RouteErrorBoundary>{children}</RouteErrorBoundary>;
}

const rootRoute = createRootRoute({ component: RootLayout });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <Navigate to="/projects" replace /> });
const chooserRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects', validateSearch: (search) => z.object({companyId:z.string().uuid().optional().catch(undefined)}).parse(search), component: ProjectChooser });
const createProjectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/new', component: CreateProjectScreen });
const createCompanyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/companies/new', component: CreateCompanyScreen });
const projectDashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId/dashboard', component: ProjectDashboard });
const projectScreenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId/$screen', validateSearch:search=>z.object({poolId:z.uuid().optional().catch(undefined),sourceId:z.uuid().optional().catch(undefined),undecided:z.boolean().optional().catch(undefined),elementId:z.uuid().optional().catch(undefined),declarationSchema:z.string().max(512).optional().catch(undefined)}).parse(search), component: () => {
  const { screen, projectId } = projectScreenRoute.useParams();
  const search=projectScreenRoute.useSearch(),navigate=projectScreenRoute.useNavigate();
  if(screen==='settings-engines')return <EnginesScreen key={projectId} projectId={projectId}/>;
  if(screen==='settings'||screen.startsWith('settings-'))return <ProjectSettingsScreen key={projectId+screen} projectId={projectId} section={screen}/>;
  if(screen==='pools')return <RouteErrorBoundary><PoolsScreen key={projectId} projectId={projectId}/></RouteErrorBoundary>;
  if(screen==='entitlements')return <RouteErrorBoundary><EntitlementsScreen projectId={projectId} search={search} onSearch={next=>{void navigate({search:next});}}/></RouteErrorBoundary>;
  if (screen === 'token-key') return <RouteErrorBoundary><TokenKeyScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'catalog') return <RouteErrorBoundary><CatalogScreen key={projectId} projectId={projectId} search={search} onSearch={next=>{void navigate({search:next});}} /></RouteErrorBoundary>;
  if (screen === 'data-sources') return <RouteErrorBoundary><SourcesScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'observations') return <RouteErrorBoundary><ObservationsScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'access') return <RouteErrorBoundary><AccessScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  return <RouteScreen title={navGroups.flatMap((group) => group.items).find((item) => item.path === `/${screen}`)?.label ?? 'Not found'} />;
} });
const introspectionListRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/sources/$sourceId/introspections',component:()=>{const params=introspectionListRoute.useParams();return <RouteErrorBoundary><IntrospectionListScreen key={params.projectId+params.sourceId} {...params}/></RouteErrorBoundary>;}});
const introspectionRunRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/introspections/$runId',component:()=>{const params=introspectionRunRoute.useParams();return <RouteErrorBoundary><IntrospectionRunScreen key={params.projectId+params.runId} {...params}/></RouteErrorBoundary>;}});
const activityRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/activity',validateSearch:s=>ActivityFilters.parse(s),component:()=>{const {projectId}=activityRoute.useParams();const filters=activityRoute.useSearch(),navigate=activityRoute.useNavigate();return <RouteErrorBoundary><ActivityScreen key={projectId} projectId={projectId} filters={filters} onFilters={next=>{void navigate({search:next});}}/></RouteErrorBoundary>;}});
const recordRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/runs/$runId',validateSearch:s=>DetailQuery.pick({startedAt:true}).parse(s),component:()=>{const params=recordRoute.useParams(),search=recordRoute.useSearch();return <RouteErrorBoundary><RecordScreen key={params.runId+search.startedAt} {...params} {...search}/></RouteErrorBoundary>;}});
const poolDetailRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/pools/$poolId',component:()=>{const params=poolDetailRoute.useParams();return <RouteErrorBoundary><PoolDetailScreen key={params.projectId+params.poolId} {...params}/></RouteErrorBoundary>;}});
const agentTwinRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/pools/$poolId/agents/$agentId',component:()=>{const params=agentTwinRoute.useParams();return <RouteErrorBoundary><AgentTwinScreen key={params.projectId+params.poolId+params.agentId} {...params}/></RouteErrorBoundary>;}});
const personalSettingsRoute=createRoute({getParentRoute:()=>rootRoute,path:'/settings',component:PersonalSettingsScreen});
const companySettingsRoute=createRoute({getParentRoute:()=>rootRoute,path:'/companies/$companyId/settings',component:()=>{const {companyId}=companySettingsRoute.useParams();return <CompanySettingsScreen companyId={companyId}/>;}});
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: () => <AuthRoute><SignInScreen /></AuthRoute> });
const checkEmailRoute = createRoute({ getParentRoute: () => rootRoute, path: '/check-email', component: () => <AuthRoute><CheckEmailScreen /></AuthRoute> });
const authCallbackRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/callback', component: () => <AuthRoute><AuthCallbackScreen /></AuthRoute> });
const confirmDeviceRoute = createRoute({ getParentRoute: () => rootRoute, path: '/auth/confirm-device', component: () => <AuthRoute><ConfirmDeviceScreen /></AuthRoute> });
const kitchenSinkRoutes = import.meta.env.DEV
  ? [createRoute({ getParentRoute: () => rootRoute, path: '/dev/kitchen-sink', component: KitchenSinkScreen })]
  : [];

function routeFor(item: NavItem) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: item.path,
    component: () => <RouteScreen title={item.label} />,
  });
}

const routes = navGroups.flatMap((group) => group.items.filter((item) => item.path !== '/projects'&&item.path!=='/settings').map(routeFor));
const routeTree = rootRoute.addChildren([personalSettingsRoute,companySettingsRoute,poolDetailRoute,agentTwinRoute,activityRoute,recordRoute,introspectionListRoute,introspectionRunRoute,dashboardRoute, chooserRoute, createProjectRoute, createCompanyRoute, projectDashboardRoute, projectScreenRoute, signInRoute, checkEmailRoute, authCallbackRoute, confirmDeviceRoute, ...kitchenSinkRoutes, ...routes]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

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
const chooserRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects', component: ProjectChooser });
const createProjectRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/new', component: CreateProjectScreen });
const createCompanyRoute = createRoute({ getParentRoute: () => rootRoute, path: '/companies/new', component: CreateCompanyScreen });
const projectDashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId/dashboard', component: ProjectDashboard });
const projectScreenRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId/$screen', component: () => {
  const { screen, projectId } = projectScreenRoute.useParams();
  if (screen === 'token-key') return <RouteErrorBoundary><TokenKeyScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'catalog') return <RouteErrorBoundary><CatalogScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'data-sources') return <RouteErrorBoundary><SourcesScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'observations') return <RouteErrorBoundary><ObservationsScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  if (screen === 'access') return <RouteErrorBoundary><AccessScreen key={projectId} projectId={projectId} /></RouteErrorBoundary>;
  return <RouteScreen title={navGroups.flatMap((group) => group.items).find((item) => item.path === `/${screen}`)?.label ?? 'Not found'} />;
} });
const introspectionListRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/sources/$sourceId/introspections',component:()=>{const params=introspectionListRoute.useParams();return <RouteErrorBoundary><IntrospectionListScreen key={params.projectId+params.sourceId} {...params}/></RouteErrorBoundary>;}});
const introspectionRunRoute=createRoute({getParentRoute:()=>rootRoute,path:'/projects/$projectId/introspections/$runId',component:()=>{const params=introspectionRunRoute.useParams();return <RouteErrorBoundary><IntrospectionRunScreen key={params.projectId+params.runId} {...params}/></RouteErrorBoundary>;}});
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

const routes = navGroups.flatMap((group) => group.items.filter((item) => item.path !== '/projects').map(routeFor));
const routeTree = rootRoute.addChildren([introspectionListRoute,introspectionRunRoute,dashboardRoute, chooserRoute, createProjectRoute, createCompanyRoute, projectDashboardRoute, projectScreenRoute, signInRoute, checkEmailRoute, authCallbackRoute, confirmDeviceRoute, ...kitchenSinkRoutes, ...routes]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

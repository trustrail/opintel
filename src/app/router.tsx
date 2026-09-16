import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import { Outlet, useRouterState } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RouteErrorBoundary } from './error-boundary.js';
import { navGroups, type NavItem } from './navigation.js';
import { AppShell } from './shell.js';
import { AuthCallbackScreen, CheckEmailScreen, ConfirmDeviceScreen, isAuthPath, SignInScreen } from './auth-screens.js';
import { AuthGuard } from './guard.js';
import { KitchenSinkScreen } from './kitchen-sink.js';

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
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <RouteScreen title="Dashboard" /> });
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

const routes = navGroups.flatMap((group) => group.items.map(routeFor));
const routeTree = rootRoute.addChildren([dashboardRoute, signInRoute, checkEmailRoute, authCallbackRoute, confirmDeviceRoute, ...kitchenSinkRoutes, ...routes]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

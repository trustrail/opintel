import { createRootRoute, createRoute, createRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { RouteErrorBoundary } from './error-boundary.js';
import { navGroups, type NavItem } from './navigation.js';
import { AppShell } from './shell.js';

function RouteScreen({ title }: { title: string }): ReactNode {
  return <RouteErrorBoundary><section className="screen on"><h1>{title}</h1></section></RouteErrorBoundary>;
}

const rootRoute = createRootRoute({ component: AppShell });
const dashboardRoute = createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <RouteScreen title="Dashboard" /> });

function routeFor(item: NavItem) {
  return createRoute({
    getParentRoute: () => rootRoute,
    path: item.path,
    component: () => <RouteScreen title={item.label} />,
  });
}

const routes = navGroups.flatMap((group) => group.items.map(routeFor));
const routeTree = rootRoute.addChildren([dashboardRoute, ...routes]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

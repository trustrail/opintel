import {useEffect} from 'react';
import {consoleAuthPaths,consoleDestination} from './shared/console-destinations.mjs';
// Frozen legacy screens; mounting and URL integration live outside src/app.
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {RouterProvider} from '@tanstack/react-router';
import {trackQueryFetchTimes} from './app/query-fetched-at.js';
import {getDeviceNonce} from './app/auth-screens.js';
import {router} from './app/router.js';
router.update({basepath:'/legacy'});
function AuthRedirect(){useEffect(()=>{window.location.replace(consoleDestination(window.location.pathname+window.location.search)??'/sign-in');},[]);return null;}
const advancedLegacy=new URL(location.href).searchParams.get('advanced')==='true';
router.subscribe('onBeforeNavigate',({toLocation})=>{const path=toLocation.pathname;if(consoleAuthPaths.includes(path)||/\/observations$/.test(path)||!advancedLegacy&&/\/(?:catalog|data-sources|introspections\/[^/]+|sources\/[^/]+\/introspections)$/.test(path)){const target=consoleDestination(path+toLocation.searchStr);if(target)window.location.replace(target);}});
for(const route of Object.values(router.routesById))if(consoleAuthPaths.includes(route.fullPath))route.update({component:AuthRedirect});
const client=new QueryClient();trackQueryFetchTimes(client.getQueryCache());getDeviceNonce();
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);

// Frozen legacy screens; mounting and URL integration live outside src/app.
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {RouterProvider} from '@tanstack/react-router';
import {trackQueryFetchTimes} from './app/query-fetched-at.js';
import {getDeviceNonce} from './app/auth-screens.js';
import {router} from './app/router.js';
router.update({basepath:'/legacy'});
const client=new QueryClient();trackQueryFetchTimes(client.getQueryCache());getDeviceNonce();
createRoot(document.getElementById('root')!).render(<QueryClientProvider client={client}><RouterProvider router={router}/></QueryClientProvider>);

import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { getDeviceNonce } from './app/auth-screens.js';
import { router } from './app/router.js';

const queryClient = new QueryClient();
getDeviceNonce();

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={queryClient}><RouterProvider router={router} /></QueryClientProvider>);

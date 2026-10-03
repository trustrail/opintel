import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, useRef, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import { createApiClient, requestLinkEmailSchema, type AppError } from '../shared/api/index.js';
import { AppRoot, Button, Card, ErrorState } from '../shared/ui/index.js';
import { completeReturnTo, rememberReturnTo } from './guard.js';

const providersResponseSchema = z.object({
  magicLink: z.boolean(),
  providers: z.array(z.object({ provider: z.string(), displayName: z.string(), startPath: z.string() })),
  enforced: z.string().nullable(),
});

const callbackResponseSchema = z.object({ deviceMismatch: z.boolean() });
const deviceNonceKey = 'opintel.device_nonce';

type ProvidersResponse = z.infer<typeof providersResponseSchema>;
type Provider = ProvidersResponse['providers'][number];
type CallbackResponse = z.infer<typeof callbackResponseSchema>;
type EmailValidationError = 'Enter your email address.' | 'That does not look like an email address.';

type AuthUiState = {
  startingProvider: string|null;
  startProvider(provider:string|null):void;
  email: string;
  emailError: EmailValidationError | null;
  revalidateEmail: boolean;
  setEmail(email: string): void;
  validateEmail(): EmailValidationError | null;
};

function emailValidationError(email: string): EmailValidationError | null {
  if (email.length === 0) return 'Enter your email address.';
  return requestLinkEmailSchema.safeParse(email).success ? null : 'That does not look like an email address.';
}

const useAuthUiStore = create<AuthUiState>((set, get) => ({
  startingProvider:null,startProvider:startingProvider=>set({startingProvider}),
  email: '',
  emailError: null,
  revalidateEmail: false,
  setEmail: (email) => {
    set((state) => ({ email, emailError: state.revalidateEmail ? emailValidationError(email) : null }));
  },
  validateEmail: () => {
    const error = emailValidationError(get().email);
    set((state) => ({ emailError: error, revalidateEmail: state.revalidateEmail || error !== null }));
    return error;
  },
}));

const authKeys = {
  providers: (email: string) => ['auth', 'providers', email] as const,
};

const api = createApiClient();

function validEmail(email: string): boolean {
  return requestLinkEmailSchema.safeParse(email).success;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const timeout = globalThis.setTimeout(() => { setDebouncedValue(value); }, delayMs);
    return () => { globalThis.clearTimeout(timeout); };
  }, [delayMs, value]);
  return debouncedValue;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return globalThis.btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function getDeviceNonce(storage: Storage = globalThis.localStorage): string {
  const existing = storage.getItem(deviceNonceKey);
  if (existing !== null && existing.length > 0) return existing;
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const nonce = base64Url(bytes);
  storage.setItem(deviceNonceKey, nonce);
  return nonce;
}

function useDeviceNonce(): string {
  return useMemo(() => getDeviceNonce(), []);
}

function requestLink(email: string, deviceNonce: string) {
  return api.request({
    path: '/api/v1/auth/request-link',
    method: 'POST',
    body: { email, deviceNonce },
    response: z.undefined(),
  });
}

function completeCallback(path: '/api/v1/auth/callback' | '/api/v1/auth/confirm-device', token: string, deviceNonce: string, confirm?: boolean) {
  return api.request({
    path,
    method: 'POST',
    body: confirm === undefined ? { token, deviceNonce } : { token, deviceNonce, confirm },
    response: callbackResponseSchema,
  });
}

function AuthLayout({ children }: { readonly children: ReactNode }): ReactNode {
  return <AppRoot><main className="authpage"><div className="authcard"><img className="authmark" src="/opintel-logo.png" srcSet="/opintel-logo@2x.png 2x, /opintel-logo@3x.png 3x" alt="Opintel" />{children}</div></main></AppRoot>;
}

function AuthCard({ children }: { readonly children: ReactNode }): ReactNode {
  return <Card><div className="sheetb">{children}</div></Card>;
}

function Message({ title, children }: { readonly title: string; readonly children: ReactNode }): ReactNode {
  return <AuthLayout><AuthCard><h1>{title}</h1>{children}</AuthCard></AuthLayout>;
}

function ApiFailure({ error, retry }: { readonly error: AppError; readonly retry: () => void | Promise<unknown> }): ReactNode {
  return <AuthLayout><AuthCard><ErrorState title="We could not complete that" description={error.message} retry={retry} /></AuthCard></AuthLayout>;
}

function SignedIn({ message = 'Your sign-in link has been confirmed.' }: { readonly message?: string }): ReactNode {
  useEffect(() => { globalThis.location.assign(completeReturnTo()); }, []);
  return <Message title="You are signed in"><p className="note">{message}</p></Message>;
}

function providerFor(response: ProvidersResponse): Provider | null {
  if (response.enforced === null) return null;
  return response.providers.find((provider) => provider.provider === response.enforced) ?? null;
}

function providerStartPath(provider:Provider,deviceNonce:string):string {
  const url=new URL(provider.startPath,globalThis.location.origin);
  url.searchParams.set('deviceNonce',deviceNonce);
  return url.pathname+url.search;
}

export function SignInScreen(): ReactNode {
  const navigate = useNavigate();
  const email = useAuthUiStore((state) => state.email);
  const emailError = useAuthUiStore((state) => state.emailError);
  const setEmail = useAuthUiStore((state) => state.setEmail);
  const validateEmail = useAuthUiStore((state) => state.validateEmail);
  const nonce = useDeviceNonce();
  const providerEmail = useDebouncedValue(email, 300);
  useEffect(() => { rememberReturnTo(new URLSearchParams(globalThis.location.search).get('next')); }, []);
  const providers = useQuery<ProvidersResponse, AppError>({
    queryKey: authKeys.providers(validEmail(providerEmail)?providerEmail:''),
    enabled: providerEmail.length===0 || validEmail(providerEmail),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const result = await api.request({ path: validEmail(providerEmail)?`/api/v1/auth/providers?email=${encodeURIComponent(providerEmail)}`:'/api/v1/auth/providers', response: providersResponseSchema });
      if (!result.ok) throw result.error;
      return result.value;
    },
  });
  const request = useMutation<void, AppError>({
    mutationFn: async () => {
      const result = await requestLink(email, nonce);
      if (!result.ok) throw result.error;
    },
  });
  const enforced = providers.data === undefined ? null : providerFor(providers.data);
  const availableProviders = providers.data?.providers ?? [];
  const magicLinkAvailable = providers.data?.magicLink ?? true;

  const submitting=useRef(false);
  const startingProvider=useAuthUiStore(s=>s.startingProvider);
  useEffect(()=>{const reset=()=>useAuthUiStore.getState().startProvider(null);reset();window.addEventListener('pageshow',reset);return ()=>window.removeEventListener('pageshow',reset);},[]);
  if (providers.isError) return <ApiFailure error={providers.error} retry={()=>providers.refetch()} />;


  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (submitting.current||startingProvider||validateEmail() !== null || !magicLinkAvailable || providers.isFetching) return;
    submitting.current=true;
    try {
      await request.mutateAsync();
      await navigate({ to: '/check-email' });
    } catch {
      // The safe API message remains beside the request action.
    }finally{submitting.current=false;}
  };

  return <Message title="Sign in"><form onSubmit={submit}>
    <div className={emailError === null ? 'fld' : 'fld err'}><label htmlFor="sign-in-email">Email address</label><input aria-describedby={emailError === null ? undefined : 'sign-in-email-error'} aria-invalid={emailError !== null} autoComplete="email" id="sign-in-email" onBlur={() => { validateEmail(); }} onChange={(event) => { setEmail(event.target.value); }} type="email" value={email} />
      <div aria-hidden={emailError === null} className="err-msg" id="sign-in-email-error">{emailError ?? '\u00a0'}</div>
    </div>
    <div className="enrolopts">
      {enforced ? <p className="note">SSO is enforced. Continue with {enforced.displayName}, or request a recovery link. Only company administrators can receive a recovery link; every use is audited.</p> : null}
      {magicLinkAvailable ? <Button disabled={request.isPending||startingProvider!==null||!validEmail(email) || emailError !== null || providers.isFetching} style={{ width: '100%' }} type="submit" variant={enforced?'ghost':'go'}>{request.isPending?'Sending link…':enforced ? 'Request administrator recovery link' : 'Continue with email'}</Button> : null}
      {request.isError?<p role="alert">{request.error.message}</p>:null}
      {availableProviders.map((provider) => <Button key={provider.provider} disabled={request.isPending||startingProvider!==null} onClick={() => { if(useAuthUiStore.getState().startingProvider)return;useAuthUiStore.getState().startProvider(provider.provider);globalThis.location.assign(providerStartPath(provider,nonce)); }} style={{ width: '100%' }} variant={enforced?'go':'ghost'}>{startingProvider===provider.provider?'Starting sign-in…':`Continue with ${provider.displayName}`}</Button>)}
      <p className="note">We will never reveal whether an account exists for an email address.</p>
    </div>
  </form></Message>;
}

export function CheckEmailScreen(): ReactNode {
  const email = useAuthUiStore((state) => state.email);
  if (email.length === 0) return <Message title="Check your email"><p className="note">Enter your email address to request a sign-in link.</p></Message>;
  return <Message title="Check your email"><p className="note">If a sign-in link is available for this address, it is on its way to {email}.</p></Message>;
}

function queryToken(): string | null {
  return new URLSearchParams(globalThis.location.search).get('token');
}

export function AuthCallbackScreen(): ReactNode {
  const navigate = useNavigate();
  const nonce = useDeviceNonce();
  const token = queryToken();
  const callback = useMutation<CallbackResponse | null, AppError>({
    mutationFn: async () => {
      if (token === null) return null;
      const result = await completeCallback('/api/v1/auth/callback', token, nonce);
      if (!result.ok) throw result.error;
      return result.value;
    },
    onSuccess: (result) => {
      if (result?.deviceMismatch === true && token !== null) void navigate({ to: '/auth/confirm-device', search: { token } });
    },
  });

  useEffect(() => { if (token !== null) callback.mutate(); }, [token]);
  if (token === null) return <Message title="This link is incomplete"><p className="note">Request another sign-in link and try again.</p></Message>;
  if (callback.isPending || callback.isIdle) return <Message title="Completing sign-in"><Button disabled aria-busy="true">Completing sign-in…</Button></Message>;
  if (callback.isError) return <ApiFailure error={callback.error} retry={()=>callback.mutateAsync()} />;
  if (callback.data?.deviceMismatch === true) return <Message title="Confirm this device"><p className="note">Preparing a confirmation prompt.</p></Message>;
  return <SignedIn />;
}

export function ConfirmDeviceScreen(): ReactNode {
  const nonce = useDeviceNonce();
  const token = queryToken();
  const confirm = useMutation<boolean | null, AppError, boolean>({
    mutationFn: async (accepted: boolean) => {
      if (token === null) return null;
      const result = await completeCallback('/api/v1/auth/confirm-device', token, nonce, accepted);
      if (!result.ok) throw result.error;
      return accepted;
    },
  });

  if (token === null) return <Message title="This link is incomplete"><p className="note">Request another sign-in link and try again.</p></Message>;

  if (confirm.data === true) return <SignedIn message="This device has been confirmed." />;
  if (confirm.data === false) return <Message title="Sign-in link declined"><p className="note">No session was created. Request a new link when you are ready.</p></Message>;
  return <Message title="Confirm this device"><p className="note">This link was opened in a different browser. Did you open it yourself?</p><Button disabled={confirm.isPending} onClick={() => { if(!confirm.isPending)confirm.mutate(true); }} variant="go">{confirm.isPending&&confirm.variables?'Confirming…':'Yes, confirm this device'}</Button><Button disabled={confirm.isPending} onClick={() => { if(!confirm.isPending)confirm.mutate(false); }} variant="ghost">{confirm.isPending&&!confirm.variables?'Declining…':'No, decline this link'}</Button>{confirm.isError?<p role="alert">{confirm.error.message}</p>:null}</Message>;
}

export function isAuthPath(pathname: string): boolean {
  return pathname === '/sign-in' || pathname === '/check-email' || pathname === '/auth/callback' || pathname === '/auth/confirm-device';
}

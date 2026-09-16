import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { create } from 'zustand';
import { z } from 'zod';
import { createApiClient, requestLinkEmailSchema, type AppError } from '../shared/api/index.js';
import { AppRoot, Button, Card, ErrorState, LoadingState } from '../shared/ui/index.js';
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
  email: string;
  emailError: EmailValidationError | null;
  revalidateEmail: boolean;
  setEmail(email: string): void;
  validateEmail(): EmailValidationError | null;
};

const platformProviders: readonly Provider[] = [
  { provider: 'oidc:google', displayName: 'Google', startPath: '/auth/oidc/oidc:google/start' },
  { provider: 'oidc:entra', displayName: 'Microsoft', startPath: '/auth/oidc/oidc:entra/start' },
];

function emailValidationError(email: string): EmailValidationError | null {
  if (email.length === 0) return 'Enter your email address.';
  return requestLinkEmailSchema.safeParse(email).success ? null : 'That does not look like an email address.';
}

const useAuthUiStore = create<AuthUiState>((set, get) => ({
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

function ApiFailure({ error, retry }: { readonly error: AppError; readonly retry: () => void }): ReactNode {
  return <AuthLayout><AuthCard><ErrorState title="We could not complete that" description={error.message} retry={retry} /></AuthCard></AuthLayout>;
}

function Redirecting({ provider }: { readonly provider: Provider }): ReactNode {
  return <Message title="Continuing to sign in"><p className="note">Continuing with {provider.displayName}.</p></Message>;
}

function SignedIn({ message = 'Your sign-in link has been confirmed.' }: { readonly message?: string }): ReactNode {
  useEffect(() => { globalThis.location.assign(completeReturnTo()); }, []);
  return <Message title="You are signed in"><p className="note">{message}</p></Message>;
}

function providerFor(response: ProvidersResponse): Provider | null {
  if (response.enforced === null) return null;
  return response.providers.find((provider) => provider.provider === response.enforced) ?? null;
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
    queryKey: authKeys.providers(providerEmail),
    enabled: validEmail(providerEmail),
    placeholderData: (previousData) => previousData,
    queryFn: async () => {
      const result = await api.request({ path: `/api/v1/auth/providers?email=${encodeURIComponent(providerEmail)}`, response: providersResponseSchema });
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
  const availableProviders = providers.data?.providers ?? platformProviders;
  const magicLinkAvailable = providers.data?.magicLink ?? true;

  useEffect(() => {
    if (enforced !== null) globalThis.location.assign(enforced.startPath);
  }, [enforced]);

  if (enforced !== null) return <Redirecting provider={enforced} />;
  if (providers.isError) return <ApiFailure error={providers.error} retry={() => { void providers.refetch(); }} />;
  if (request.isError) return <ApiFailure error={request.error} retry={() => { request.reset(); }} />;
  if (request.isPending) return <AuthLayout><AuthCard><LoadingState /></AuthCard></AuthLayout>;

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (validateEmail() !== null || !magicLinkAvailable || providers.isFetching) return;
    try {
      await request.mutateAsync();
      await navigate({ to: '/check-email' });
    } catch {
      // The mutation state renders the documented error state.
    }
  };

  return <Message title="Sign in"><form onSubmit={submit}>
    <div className={emailError === null ? 'fld' : 'fld err'}><label htmlFor="sign-in-email">Email address</label><input aria-describedby={emailError === null ? undefined : 'sign-in-email-error'} aria-invalid={emailError !== null} autoComplete="email" id="sign-in-email" onBlur={() => { validateEmail(); }} onChange={(event) => { setEmail(event.target.value); }} type="email" value={email} />
      <div aria-hidden={emailError === null} className="err-msg" id="sign-in-email-error">{emailError ?? '\u00a0'}</div>
    </div>
    <div className="enrolopts">
      {magicLinkAvailable ? <Button disabled={!validEmail(email) || emailError !== null || providers.isFetching} style={{ width: '100%' }} type="submit" variant="go">Continue with email</Button> : null}
      {availableProviders.map((provider) => <Button key={provider.provider} onClick={() => { globalThis.location.assign(provider.startPath); }} style={{ width: '100%' }} variant="ghost">Continue with {provider.displayName}</Button>)}
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
  if (callback.isPending || callback.isIdle) return <AuthLayout><AuthCard><LoadingState /></AuthCard></AuthLayout>;
  if (callback.isError) return <ApiFailure error={callback.error} retry={() => { callback.reset(); callback.mutate(); }} />;
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
  if (confirm.isPending) return <AuthLayout><AuthCard><LoadingState /></AuthCard></AuthLayout>;
  if (confirm.isError) return <ApiFailure error={confirm.error} retry={() => { confirm.reset(); }} />;
  if (confirm.data === true) return <SignedIn message="This device has been confirmed." />;
  if (confirm.data === false) return <Message title="Sign-in link declined"><p className="note">No session was created. Request a new link when you are ready.</p></Message>;
  return <Message title="Confirm this device"><p className="note">This link was opened in a different browser. Did you open it yourself?</p><Button onClick={() => { confirm.mutate(true); }} variant="go">Yes, confirm this device</Button><Button onClick={() => { confirm.mutate(false); }} variant="ghost">No, decline this link</Button></Message>;
}

export function isAuthPath(pathname: string): boolean {
  return pathname === '/sign-in' || pathname === '/check-email' || pathname === '/auth/callback' || pathname === '/auth/confirm-device';
}

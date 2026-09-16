import { createContext, useContext, useMemo, useState, type PropsWithChildren, type ReactNode } from 'react';

type ToastContextValue = { show(message: string): void; clear(): void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastHost({ children }: PropsWithChildren): ReactNode {
  const [message, setMessage] = useState<string | null>(null);
  const value = useMemo<ToastContextValue>(() => ({ show: setMessage, clear: () => setMessage(null) }), []);
  return <ToastContext.Provider value={value}>{children}<div className={message === null ? 'toast' : 'toast on'} role="status" aria-live="polite">{message}</div></ToastContext.Provider>;
}

export function useToast(): ToastContextValue {
  const toast = useContext(ToastContext);
  if (toast === null) throw new Error('useToast must be used inside ToastHost.');
  return toast;
}

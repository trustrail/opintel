import {useSyncExternalStore} from 'react';

const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function refresh() {
  now = Date.now();
  for (const listener of listeners) listener();
}
function visibilityChanged() {
  if (document.visibilityState === 'visible') refresh();
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    refresh();
    timer = setInterval(refresh, 60_000);
    document.addEventListener('visibilitychange', visibilityChanged);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
      document.removeEventListener('visibilitychange', visibilityChanged);
    }
  };
}
const snapshot = () => now;

/** One clock for mounted timestamps; screen/query components do not subscribe. */
export function useTimestampClock() {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function formatRelativeTime(value: string, currentTime: number) {
  const difference = currentTime - new Date(value).getTime();
  const elapsed = Math.abs(difference);
  const future = difference < 0;
  if (elapsed < 60_000) return future ? 'in less than a minute' : 'just now';
  const [divisor, unit] = elapsed < 3_600_000 ? [60_000, 'minute'] as const
    : elapsed < 86_400_000 ? [3_600_000, 'hour'] as const : [86_400_000, 'day'] as const;
  const count = Math.floor(elapsed / divisor);
  const age = `${count} ${unit}${count === 1 ? '' : 's'}`;
  return future ? `in ${age}` : `${age} ago`;
}

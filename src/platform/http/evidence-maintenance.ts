type MaintenancePhase = 'provision' | 'retain';

/** Startup provisioning is awaited separately, before accepting requests. */
export function scheduleEvidenceMaintenance(
  tasks: Record<MaintenancePhase, () => Promise<void>>,
  failed: (phase: MaintenancePhase) => void,
): () => void {
  const timers = (['provision', 'retain'] as const).map(phase => {
    // Each job owns its guard: a stuck retention pass cannot starve provisioning.
    let running = false;
    const tick = (): void => {
      if (running) return;
      running = true;
      void Promise.resolve().then(tasks[phase])
        .catch(() => failed(phase))
        .finally(() => { running = false; });
    };
    if (phase === 'retain') tick();
    const timer = setInterval(tick, 60 * 60 * 1000);
    timer.unref();
    return timer;
  });
  return () => { for (const timer of timers) clearInterval(timer); };
}

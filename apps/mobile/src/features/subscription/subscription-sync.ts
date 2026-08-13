type SyncOptions = Readonly<{
  intervalMs?: number;
  maxWaitMs?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

const wait = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const entitlementState = (value: unknown): boolean | null => {
  if (typeof value !== 'object' || value === null) return null;
  const data = (value as Record<string, unknown>).data;
  if (typeof data !== 'object' || data === null) return null;
  const viewer = (data as Record<string, unknown>).viewer;
  if (typeof viewer !== 'object' || viewer === null) return null;
  const entitlement = (viewer as Record<string, unknown>).entitlement;
  if (typeof entitlement !== 'object' || entitlement === null) return null;
  const active = (entitlement as Record<string, unknown>).isActive;
  return typeof active === 'boolean' ? active : null;
};

export const syncViewerEntitlement = async (
  refetch: () => Promise<unknown>,
  expectedActive: boolean,
  options: SyncOptions = {},
): Promise<'SYNCED' | 'TIMEOUT'> => {
  const intervalMs = options.intervalMs ?? 2_000;
  const maxWaitMs = options.maxWaitMs ?? 30_000;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? wait;
  const startedAt = now();

  while (true) {
    if (entitlementState(await refetch()) === expectedActive) return 'SYNCED';
    const remaining = maxWaitMs - (now() - startedAt);
    if (remaining <= 0) return 'TIMEOUT';
    await sleep(Math.min(intervalMs, remaining));
  }
};

import { syncViewerEntitlement } from './subscription-sync';

describe('subscription entitlement sync', () => {
  it('polls every two seconds until a purchase changes the key from trial to pro', async () => {
    let now = 0;
    const states = [
      { key: 'trial', isActive: true },
      { key: 'trial', isActive: true },
      { key: 'pro', isActive: true },
    ];
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: {
          viewer: { entitlement: states.shift() ?? { key: 'pro', isActive: true } },
        },
      }),
    );
    await expect(
      syncViewerEntitlement(refetch, true, {
        now: () => now,
        sleep: (milliseconds) => {
          now += milliseconds;
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('SYNCED');
    expect(now).toBe(4_000);
  });

  it('times out after thirty seconds while the viewer remains trial-active', async () => {
    let now = 0;
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: { viewer: { entitlement: { key: 'trial', isActive: true } } },
      }),
    );
    await expect(
      syncViewerEntitlement(refetch, true, {
        now: () => now,
        sleep: (milliseconds) => {
          now += milliseconds;
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('TIMEOUT');
    expect(now).toBe(30_000);
  });

  it('treats restore with no purchase as synced during an active trial', async () => {
    let now = 0;
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: { viewer: { entitlement: { key: 'trial', isActive: true } } },
      }),
    );
    await expect(
      syncViewerEntitlement(refetch, false, {
        now: () => now,
        sleep: (milliseconds) => {
          now += milliseconds;
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('SYNCED');
    expect(now).toBe(0);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('times out restoring no purchase while a stale pro key remains', async () => {
    let now = 0;
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: { viewer: { entitlement: { key: 'pro', isActive: true } } },
      }),
    );
    await expect(
      syncViewerEntitlement(refetch, false, {
        now: () => now,
        sleep: (milliseconds) => {
          now += milliseconds;
          return Promise.resolve();
        },
      }),
    ).resolves.toBe('TIMEOUT');
    expect(now).toBe(30_000);
  });
});

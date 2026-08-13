import { syncViewerEntitlement } from './subscription-sync';

describe('subscription entitlement sync', () => {
  it('polls every two seconds until viewer reflects the purchase', async () => {
    let now = 0;
    const states = [false, false, true];
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: { viewer: { entitlement: { isActive: states.shift() ?? true } } },
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

  it('stops after thirty seconds when backend sync is delayed', async () => {
    let now = 0;
    const refetch = jest.fn(() =>
      Promise.resolve({
        data: { viewer: { entitlement: { isActive: false } } },
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
});

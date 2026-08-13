import { pollAssetUntilSettled } from './asset-status';

const poll = async (statuses: Array<'PROCESSING' | 'READY' | 'REJECTED'>) => {
  let now = 0;
  const readStatus = jest.fn(() => Promise.resolve(statuses.shift() ?? 'PROCESSING'));
  const result = await pollAssetUntilSettled('asset-1', {
    maxWaitMs: 2_000,
    now: () => now,
    readStatus,
    sleep: (milliseconds) => {
      now += milliseconds;
      return Promise.resolve();
    },
  });
  return { readStatus, result };
};

describe('asset processing poll', () => {
  it('settles when the asset becomes ready', async () => {
    const { result } = await poll(['PROCESSING', 'READY']);
    expect(result).toBe('READY');
  });

  it('settles when the asset is rejected', async () => {
    const { result } = await poll(['REJECTED']);
    expect(result).toBe('REJECTED');
  });

  it('times out while retaining a retryable state', async () => {
    const { readStatus, result } = await poll([]);
    expect(result).toBe('TIMEOUT');
    expect(readStatus).toHaveBeenCalledTimes(3);
  });
});

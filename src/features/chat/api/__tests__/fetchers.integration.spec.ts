import { cancelRunThenStop } from '../fetchers';

describe('chat cancellation HTTP contract', () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it.each(['cancelled', 'already_cancelled'] as const)(
    'returns the %s cancellation outcome and stops locally',
    async (outcome) => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ outcome }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
      const stop = jest.fn();

      await expect(cancelRunThenStop('thread-1', 'run-1', stop)).resolves.toBe(outcome);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/v1/ai/chat/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ threadId: 'thread-1', runId: 'run-1' }),
        }),
      );
      expect(stop).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['completed', 'failed'] as const)(
    'returns %s when cancellation loses to a terminal run',
    async (outcome) => {
      const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ outcome }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
      );
      const stop = jest.fn();
      await expect(cancelRunThenStop('thread-1', 'run-1', stop)).resolves.toBe(outcome);
      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:4000/v1/ai/chat/cancel',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ threadId: 'thread-1', runId: 'run-1' }),
        }),
      );
      expect(stop).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    new Response(JSON.stringify({ outcome: 'unknown' }), { status: 200 }),
    new Response(null, { status: 500 }),
  ])(
    'rejects an invalid or failed cancellation response while still stopping',
    async (response) => {
      jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
      const stop = jest.fn();

      await expect(cancelRunThenStop('thread-1', 'run-1', stop)).rejects.toThrow(
        '응답을 중지하지 못했습니다. 다시 시도해 주세요.',
      );
      expect(stop).toHaveBeenCalledTimes(1);
    },
  );

  it('shares one HTTP cancellation flight while each caller finalizes its own client', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await pending;
      return new Response(JSON.stringify({ outcome: 'cancelled' }), { status: 200 });
    });
    const staleStop = jest.fn();
    const currentStop = jest.fn();

    const first = cancelRunThenStop('thread-1', 'run-1', staleStop, () => false);
    const second = cancelRunThenStop('thread-1', 'run-1', currentStop, () => true);
    release();

    await expect(Promise.all([first, second])).resolves.toEqual([
      'cancelled',
      'cancelled',
    ]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(staleStop).not.toHaveBeenCalled();
    expect(currentStop).toHaveBeenCalledTimes(1);
  });

  it('does not stop a newer run after the captured cancellation settles', async () => {
    jest.useFakeTimers();
    jest.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return new Response(JSON.stringify({ outcome: 'cancelled' }), { status: 200 });
    });
    const stop = jest.fn();
    let currentRunId = 'run-1';
    let settled = false;

    const cancellation = cancelRunThenStop(
      'thread-1',
      'run-1',
      stop,
      () => currentRunId === 'run-1',
    );
    void cancellation.then(() => {
      settled = true;
    });
    currentRunId = 'run-2';

    await jest.advanceTimersByTimeAsync(1_999);
    expect(settled).toBe(false);
    expect(stop).not.toHaveBeenCalled();

    await jest.advanceTimersByTimeAsync(1);

    await expect(cancellation).resolves.toBe('cancelled');
    expect(settled).toBe(true);
    expect(currentRunId).toBe('run-2');
    expect(stop).not.toHaveBeenCalled();
  });
});

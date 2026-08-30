import { cancelRunThenStop } from '../fetchers';

describe('chat cancellation HTTP contract', () => {
  afterEach(() => jest.restoreAllMocks());

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
});

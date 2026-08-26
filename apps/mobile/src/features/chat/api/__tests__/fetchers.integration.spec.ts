import { cancelRunThenStop } from '../fetchers';

describe('chat cancellation HTTP contract', () => {
  afterEach(() => jest.restoreAllMocks());

  it('treats an already completed or cancelled 204 as success and stops locally', async () => {
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 204 }));
    const stop = jest.fn();
    await expect(cancelRunThenStop('thread-1', 'run-1', stop)).resolves.toBeUndefined();
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/v1/ai/chat/cancel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ threadId: 'thread-1', runId: 'run-1' }),
      }),
    );
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

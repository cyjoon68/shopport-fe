import { useApolloClient, useQuery } from '@apollo/client/react';
import {
  type ConnectionAdapter,
  type SubscribeConnectionAdapter,
  useChat,
  xhrHttpStream,
} from '@tanstack/ai-react';
import { act, renderHook } from '@testing-library/react-native';
import {
  createElement,
  createRef,
  type MutableRefObject,
  type ReactNode,
  StrictMode,
} from 'react';
import { AppState } from 'react-native';

import { flushChatPersistence, sqliteChatPersistence } from '@/shared/storage';

import type { RetailerId } from '../../types';
import { useChatRun, useUploadedImages } from '../hooks';

jest.mock('@apollo/client/react', () => ({
  useApolloClient: jest.fn(),
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock(
  '@tanstack/ai-react',
  () => ({
    useChat: jest.fn(),
    xhrHttpStream: jest.fn(),
  }),
  { virtual: true },
);

jest.mock('@/shared/storage', () => ({
  flushChatPersistence: jest.fn(() => Promise.resolve()),
  sqliteChatPersistence: {
    getItem: jest.fn(),
    removeItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

const mockedUseApolloClient = jest.mocked(useApolloClient);
const mockedUseQuery = jest.mocked(useQuery);
const mockedUseChat = jest.mocked(useChat);
const mockedXhrHttpStream = jest.mocked(xhrHttpStream);
const mockedPersistence = jest.mocked(sqliteChatPersistence);
const mockedFlushChatPersistence = jest.mocked(flushChatPersistence);

const normalizeLikeSdk = (connection: ConnectionAdapter): SubscribeConnectionAdapter => {
  if ('subscribe' in connection && 'send' in connection) return connection;
  if (!('connect' in connection)) throw new Error('connection adapter unavailable');
  const buffer: Array<
    Parameters<NonNullable<Parameters<typeof useChat>[0]['onChunk']>>[0]
  > = [];
  const waiters: Array<(chunk: (typeof buffer)[number] | null) => void> = [];
  return {
    subscribe: (signal) =>
      (async function* () {
        while (!signal?.aborted) {
          const buffered = buffer.shift();
          const chunk =
            buffered ??
            (await new Promise<(typeof buffer)[number] | null>((resolve) => {
              waiters.push(resolve);
            }));
          if (chunk) yield chunk;
        }
      })(),
    send: async (messages, data, signal, runContext) => {
      for await (const chunk of connection.connect(messages, data, signal, runContext)) {
        const waiter = waiters.shift();
        if (waiter) waiter(chunk);
        else buffer.push(chunk);
      }
    },
  };
};

const refetchQueries = jest.fn();
const stop = jest.fn();
const connect = jest.fn();
const joinRun = jest.fn();
let chatOptions: Parameters<typeof useChat>[0] | undefined;

const emptyStream = async function* () {};

beforeEach(() => {
  jest.clearAllMocks();
  chatOptions = undefined;
  connect.mockImplementation(emptyStream);
  joinRun.mockImplementation(emptyStream);
  mockedUseApolloClient.mockReturnValue({ refetchQueries } as never);
  mockedXhrHttpStream.mockReturnValue({ connect, joinRun });
  mockedUseChat.mockImplementation((options) => {
    chatOptions = options;
    return { messages: [], stop } as never;
  });
});

describe('useChatRun', () => {
  const options = (online: boolean) => {
    const providerIds: MutableRefObject<ReadonlyArray<RetailerId> | undefined> = {
      current: undefined,
    };
    return {
      assetId: createRef<string | null>(),
      conversationId: 'conversation-1',
      online,
      onFinish: jest.fn(),
      providerIds,
      remoteWorkRef: { current: online },
    };
  };

  it.each(['sendMessage', 'reload'] as const)(
    'returns an explicit failure when %s reports a resolved stream error',
    async (operation) => {
      const streamError = new Error('transport failed');
      const sdkSendMessage = jest.fn(() => {
        chatOptions?.onError?.(streamError);
        return Promise.resolve();
      });
      const sdkReload = jest.fn(() => {
        chatOptions?.onError?.(streamError);
        return Promise.resolve();
      });
      mockedUseChat.mockImplementationOnce((nextOptions) => {
        chatOptions = nextOptions;
        return {
          messages: [],
          reload: sdkReload,
          sendMessage: sdkSendMessage,
          stop,
        } as never;
      });
      const { result } = renderHook(() => useChatRun(options(true)));

      const outcome =
        operation === 'sendMessage'
          ? await result.current.sendMessage('question')
          : await result.current.reload();

      expect(outcome).toEqual({ error: streamError, ok: false });
    },
  );

  it('attributes a direct transport error to the active run after a queued send resolves', async () => {
    const runAError = new Error('run A failed');
    let resolveRunA!: () => void;
    const runA = new Promise<void>((resolve) => {
      resolveRunA = resolve;
    });
    const sdkSendMessage = jest
      .fn()
      .mockReturnValueOnce(runA)
      .mockResolvedValueOnce(undefined);
    mockedUseChat.mockImplementationOnce((nextOptions) => {
      chatOptions = nextOptions;
      return {
        messages: [],
        sendMessage: sdkSendMessage,
        stop,
      } as never;
    });
    const initial = { ...options(true), onRunError: jest.fn() };
    const { result } = renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection) throw new Error('connection adapter unavailable');

    const sendingA = result.current.sendMessage('question A');
    await normalizeLikeSdk(connection).send([], undefined, undefined, {
      runId: 'run-a',
      threadId: 'conversation-1',
    });
    await expect(
      result.current.sendMessage('queued question', { whenBusy: 'queue' }),
    ).resolves.toEqual({ ok: true });
    chatOptions?.onError?.(runAError);
    resolveRunA();

    await expect(sendingA).resolves.toEqual({ error: runAError, ok: false });
    expect(initial.onRunError).toHaveBeenCalledWith(runAError, 'run-a');
  });

  it('reports the active run for a queued drain error without a caller operation', async () => {
    const runError = new Error('queued run failed');
    const initial = { ...options(true), onRunError: jest.fn() };
    renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection) throw new Error('connection adapter unavailable');

    await normalizeLikeSdk(connection).send([], undefined, undefined, {
      runId: 'queued-run',
      threadId: 'conversation-1',
    });
    chatOptions?.onError?.(runError);

    expect(initial.onRunError).toHaveBeenCalledWith(runError, 'queued-run');
  });

  it('reports the active run for a resumed join error without a caller operation', async () => {
    const runError = new Error('resumed run failed');
    const initial = { ...options(true), onRunError: jest.fn() };
    renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');

    for await (const _chunk of connection.joinRun('resumed-run')) void _chunk;
    chatOptions?.onError?.(runError);

    expect(initial.onRunError).toHaveBeenCalledWith(runError, 'resumed-run');
  });

  it('bridges an expired replay to one correlated terminal error and flushes it', async () => {
    joinRun.mockImplementation(async function* () {
      yield await Promise.reject(new Error('XHR error! status: 410 Gone'));
    });
    const initial = { ...options(true), onRunError: jest.fn() };
    renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');

    const chunks = [];
    for await (const chunk of connection.joinRun('run-1')) {
      chunks.push(chunk);
      const error = new Error(
        'message' in chunk && typeof chunk.message === 'string'
          ? chunk.message
          : 'missing error',
      );
      chatOptions?.onChunk?.(chunk);
      chatOptions?.onError?.(error);
    }
    expect(chunks).toEqual([
      expect.objectContaining({
        message: 'Run replay expired',
        runId: 'run-1',
        threadId: 'conversation-1',
        type: 'RUN_ERROR',
      }),
    ]);
    expect(initial.onRunError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Run replay expired' }),
      'run-1',
    );
    expect(initial.onRunError).toHaveBeenCalledTimes(1);
    expect(mockedFlushChatPersistence).toHaveBeenCalledWith('conversation-1');
  });

  it('keeps a late run A error correlated away from the active run B operation', async () => {
    const runAError = new Error('run A failed');
    let resolveRunA!: () => void;
    let resolveRunB!: () => void;
    const runA = new Promise<void>((resolve) => {
      resolveRunA = resolve;
    });
    const runB = new Promise<void>((resolve) => {
      resolveRunB = resolve;
    });
    const sdkSendMessage = jest.fn(() => runA);
    const sdkReload = jest.fn(() => runB);
    mockedUseChat.mockImplementationOnce((nextOptions) => {
      chatOptions = nextOptions;
      return {
        messages: [],
        reload: sdkReload,
        sendMessage: sdkSendMessage,
        stop,
      } as never;
    });
    const initial = { ...options(true), onRunError: jest.fn() };
    const { result } = renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection) throw new Error('connection adapter unavailable');
    const sdkConnection = normalizeLikeSdk(connection);

    const sendingA = result.current.sendMessage('question A');
    const reloadingB = result.current.reload();
    const abortedA = new AbortController();
    abortedA.abort();
    await sdkConnection.send([], undefined, abortedA.signal, {
      runId: 'run-a',
    } as never);
    await sdkConnection.send([], undefined, undefined, {
      runId: 'run-b',
    } as never);
    chatOptions?.onChunk?.({
      message: runAError.message,
      runId: 'run-a',
      type: 'RUN_ERROR',
    } as never);
    chatOptions?.onError?.(runAError);
    resolveRunB();

    await expect(reloadingB).resolves.toEqual({ ok: true });
    expect(initial.onRunError).toHaveBeenCalledWith(runAError, 'run-a');

    resolveRunA();
    await expect(sendingA).resolves.toEqual({ ok: true });
  });

  it('drops a run A terminal already buffered by SDK normalization after run B starts', async () => {
    let releaseRunA!: () => void;
    const runABuffer = new Promise<void>((resolve) => {
      releaseRunA = resolve;
    });
    connect.mockImplementation(async function* (
      _messages,
      _data,
      _signal,
      runContext: { runId?: string } | undefined,
    ) {
      if (runContext?.runId === 'run-a') {
        yield { type: 'TEXT_MESSAGE_START' } as never;
        await runABuffer;
        yield {
          message: 'run A failed',
          runId: 'run-a',
          type: 'RUN_ERROR',
        } as never;
        return;
      }
      if (runContext?.runId === 'run-b')
        yield { runId: 'run-b', type: 'RUN_FINISHED' } as never;
    });
    renderHook(() => useChatRun(options(true)));
    const connection = chatOptions?.connection;
    if (!connection) throw new Error('connection adapter unavailable');
    const sdkConnection = normalizeLikeSdk(connection);
    const subscription = sdkConnection.subscribe()[Symbol.asyncIterator]();
    const sendingA = sdkConnection.send([], undefined, undefined, {
      runId: 'run-a',
      threadId: 'conversation-1',
    });
    const first = await subscription.next();
    expect(first.done).toBe(false);
    expect((first.value as { type?: unknown })?.type).toBe('TEXT_MESSAGE_START');
    releaseRunA();
    await sendingA;
    await sdkConnection.send([], undefined, undefined, {
      runId: 'run-b',
      threadId: 'conversation-1',
    });

    const second = await subscription.next();
    expect(second.done).toBe(false);
    expect((second.value as { runId?: unknown })?.runId).toBe('run-b');
    await subscription.return?.();
  });

  it('drops buffered chunks as soon as the active request is aborted', async () => {
    connect.mockImplementation(async function* () {
      yield await Promise.resolve({ type: 'TEXT_MESSAGE_START' } as never);
      yield { delta: 'stale', type: 'TEXT_MESSAGE_CONTENT' } as never;
      yield { runId: 'run-a', type: 'RUN_FINISHED' } as never;
    });
    renderHook(() => useChatRun(options(true)));
    const connection = chatOptions?.connection;
    if (!connection) throw new Error('connection adapter unavailable');
    const sdkConnection = normalizeLikeSdk(connection);
    const subscriptionController = new AbortController();
    const subscription = sdkConnection
      .subscribe(subscriptionController.signal)
      [Symbol.asyncIterator]();
    const requestController = new AbortController();
    const firstChunk = subscription.next();

    await sdkConnection.send([], undefined, requestController.signal, {
      runId: 'run-a',
      threadId: 'conversation-1',
    });
    const first = await firstChunk;
    expect(first.done).toBe(false);
    expect((first.value as { type?: unknown })?.type).toBe('TEXT_MESSAGE_START');
    requestController.abort();
    const nextChunk = subscription.next();
    await expect(
      Promise.race([
        nextChunk.then(() => 'chunk'),
        new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 0)),
      ]),
    ).resolves.toBe('pending');

    subscriptionController.abort();
    await expect(nextChunk).resolves.toEqual({ done: true, value: undefined });
  });

  it('preserves a persisted resume while offline without joining it', async () => {
    const persisted = {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    };
    mockedPersistence.getItem.mockResolvedValue(persisted as never);
    renderHook(() => useChatRun(options(false)));

    await expect(
      (chatOptions?.persistence as typeof sqliteChatPersistence).getItem(
        'conversation-1',
      ),
    ).resolves.toEqual({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
    });
    await (chatOptions?.persistence as typeof sqliteChatPersistence).setItem(
      'conversation-1',
      { messages: [{ id: 'message-1' }] } as never,
    );
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');
    for await (const _chunk of connection.joinRun('run-1')) void _chunk;
    await normalizeLikeSdk(connection).send([]);
    expect(joinRun).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
    expect(mockedPersistence.setItem).toHaveBeenCalledWith('conversation-1', persisted);
  });

  it('does not block a different run UUID with a shared cancelled tombstone', async () => {
    const initial = options(true);
    renderHook(() =>
      useChatRun({
        ...initial,
        cancelledRunIdsRef: { current: new Set(['run-a']) },
      }),
    );
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');

    for await (const _chunk of connection.joinRun('run-b')) void _chunk;

    expect(joinRun).toHaveBeenCalledWith('run-b', undefined);
  });

  it('stores a valid active run context only with its matching persisted resume', async () => {
    const initial = options(true);
    renderHook(() =>
      useChatRun({
        ...initial,
        runContextRef: {
          current: {
            assetId: 'asset-1',
            conversationId: 'conversation-1',
            providerIds: ['oliveyoung'],
            runId: 'run-1',
          },
        },
      }),
    );

    await (chatOptions?.persistence as typeof sqliteChatPersistence).setItem(
      'conversation-1',
      {
        messages: [{ id: 'message-1' }],
        resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      } as never,
    );

    expect(mockedPersistence.setItem).toHaveBeenCalledWith('conversation-1', {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    });
  });

  it('ignores invalid or stale persisted run context while preserving canonical resume', async () => {
    const onResumeContext = jest.fn();
    const persisted = {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-2',
        providerIds: ['not-a-retailer'],
        runId: 'run-2',
      },
    };
    mockedPersistence.getItem.mockResolvedValue(persisted as never);
    renderHook(() => useChatRun({ ...options(true), onResumeContext }));

    await expect(
      (chatOptions?.persistence as typeof sqliteChatPersistence).getItem(
        'conversation-1',
      ),
    ).resolves.toEqual({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
    });
    expect(onResumeContext).not.toHaveBeenCalled();
  });

  it('drops an offline-origin write when reconnecting during its persisted read', async () => {
    let resolvePersisted!: (state: unknown) => void;
    const persistedRead = new Promise<unknown>((resolve) => {
      resolvePersisted = resolve;
    });
    const initial = options(false);
    mockedPersistence.getItem.mockReturnValueOnce(persistedRead as never);
    renderHook(() => useChatRun(initial));
    const write = (chatOptions?.persistence as typeof sqliteChatPersistence).setItem(
      'conversation-1',
      { messages: [{ id: 'message-1' }] } as never,
    );

    initial.remoteWorkRef.current = true;
    resolvePersisted({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
    });
    await write;

    expect(mockedPersistence.setItem).not.toHaveBeenCalled();
  });

  it('does not restore a terminally cancelled resume from a late offline write', async () => {
    let resolveClearRead!: (state: unknown) => void;
    const clearRead = new Promise<unknown>((resolve) => {
      resolveClearRead = resolve;
    });
    const persisted = {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    };
    const initial = options(true);
    mockedPersistence.getItem
      .mockReturnValueOnce(clearRead as never)
      .mockResolvedValue(persisted as never);
    const { result } = renderHook(() => useChatRun(initial));

    const clear = result.current.clearPersistedResume('run-1');
    initial.remoteWorkRef.current = false;
    await (chatOptions?.persistence as typeof sqliteChatPersistence).setItem(
      'conversation-1',
      { messages: [{ id: 'message-1' }] } as never,
    );
    resolveClearRead(persisted);
    await clear;

    expect(mockedPersistence.setItem).toHaveBeenNthCalledWith(1, 'conversation-1', {
      messages: [{ id: 'message-1' }],
    });
    expect(mockedPersistence.setItem).toHaveBeenNthCalledWith(2, 'conversation-1', {
      messages: [{ id: 'message-1' }],
    });
  });

  it('strips a tombstoned resume and context after an offline write has awaited storage', async () => {
    let resolveWriteRead!: (state: unknown) => void;
    let resolveClearRead!: (state: unknown) => void;
    const writeRead = new Promise<unknown>((resolve) => {
      resolveWriteRead = resolve;
    });
    const clearRead = new Promise<unknown>((resolve) => {
      resolveClearRead = resolve;
    });
    const persisted = {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    };
    const initial = options(false);
    const { result } = renderHook(() =>
      useChatRun({
        ...initial,
        runContextRef: {
          current: {
            assetId: 'asset-1',
            conversationId: 'conversation-1',
            providerIds: ['oliveyoung'],
            runId: 'run-1',
          },
        },
      }),
    );
    mockedPersistence.getItem
      .mockReturnValueOnce(writeRead as never)
      .mockReturnValueOnce(clearRead as never);
    const write = (chatOptions?.persistence as typeof sqliteChatPersistence).setItem(
      'conversation-1',
      persisted as never,
    );
    const clear = result.current.clearPersistedResume('run-1');
    resolveWriteRead(persisted);
    await write;

    expect(mockedPersistence.setItem).toHaveBeenCalledWith('conversation-1', {
      messages: [{ id: 'message-1' }],
    });
    resolveClearRead(persisted);
    await clear;
  });

  it('stops an active client and blocks finish refetch after going offline', () => {
    const initial = options(true);
    const remoteWorkRef = initial.remoteWorkRef;
    const { rerender } = renderHook(
      ({ online }: { online: boolean }) => {
        remoteWorkRef.current = online;
        return useChatRun({ ...initial, online });
      },
      { initialProps: { online: true } },
    );
    const finish = chatOptions?.onFinish;

    rerender({ online: false });
    act(() => finish?.({} as never));

    expect(stop).toHaveBeenCalledTimes(1);
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it('clears the prior finish fallback when a new transport run starts', async () => {
    const initial = options(true);
    const onFinish = initial.onFinish;
    renderHook(() => useChatRun(initial));
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');

    chatOptions?.onChunk?.({ runId: 'run-a', type: 'RUN_FINISHED' } as never);
    chatOptions?.onFinish?.({} as never);
    for await (const _chunk of connection.joinRun('run-b')) void _chunk;
    chatOptions?.onChunk?.({ runId: 'run-b', type: 'RUN_FINISHED' } as never);
    chatOptions?.onFinish?.({} as never);

    expect(onFinish).toHaveBeenNthCalledWith(1, 'run-a');
    expect(onFinish).toHaveBeenNthCalledWith(2, 'run-b');
  });

  it('keeps a transport active after StrictMode replays its effect', async () => {
    renderHook(() => useChatRun(options(true)), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(StrictMode, null, children),
    });
    const connection = chatOptions?.connection;
    if (!connection || !('joinRun' in connection) || !connection.joinRun)
      throw new Error('resumable connection unavailable');

    for await (const _chunk of connection.joinRun('run-1')) void _chunk;

    expect(joinRun).toHaveBeenCalledTimes(1);
  });

  it.each(['inactive', 'background'] as const)(
    'flushes chat persistence when the app becomes %s',
    (nextState) => {
      let onChange: ((state: string) => void) | undefined;
      jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
        onChange = listener as (state: string) => void;
        return { remove: jest.fn() };
      });
      renderHook(() => useChatRun(options(true)));

      onChange?.(nextState);

      expect(mockedFlushChatPersistence).toHaveBeenCalledWith('conversation-1');
    },
  );
});

describe('useUploadedImages', () => {
  it('blocks a retained pagination callback after remote reads are disabled', () => {
    const fetchMore = jest.fn();
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useUploadedImages(enabled),
      { initialProps: { enabled: true } },
    );
    const retainedLoadMore = result.current.loadMore;

    rerender({ enabled: false });
    void retainedLoadMore();

    expect(fetchMore).not.toHaveBeenCalled();
  });

  it('suppresses a duplicate cursor while fetchMore is in flight', async () => {
    let resolveFetchMore!: () => void;
    const fetchMore = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFetchMore = resolve;
        }),
    );
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useUploadedImages(true));

    const first = result.current.loadMore();
    await expect(result.current.loadMore()).resolves.toBeUndefined();
    expect(fetchMore).toHaveBeenCalledTimes(1);
    resolveFetchMore();
    await first;
  });

  it('allows retrying the same cursor after fetchMore rejects', async () => {
    const fetchMore = jest
      .fn()
      .mockRejectedValueOnce(new Error('pagination failed'))
      .mockResolvedValueOnce(undefined);
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useUploadedImages(true));

    await expect(result.current.loadMore()).rejects.toThrow('pagination failed');
    await expect(result.current.loadMore()).resolves.toBeUndefined();
    expect(fetchMore).toHaveBeenCalledTimes(2);
  });

  it('keeps cursor B active when A settles first and retained A retries', async () => {
    let resolveA!: () => void;
    let resolveB!: () => void;
    const requestA = new Promise<void>((resolve) => {
      resolveA = resolve;
    });
    const requestB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA)
      .mockReturnValueOnce(requestB)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            conversations: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useUploadedImages(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;

    const firstA = retainedA();
    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    await retainedA();
    expect(fetchMore).toHaveBeenCalledTimes(2);

    resolveA();
    await firstA;
    await retainedA();
    expect(fetchMore).toHaveBeenNthCalledWith(1, {
      variables: { after: 'cursor-a', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(2, {
      variables: { after: 'cursor-b', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(3, {
      variables: { after: 'cursor-a', first: 20 },
    });
    resolveB();
    await firstB;
  });

  it('keeps A active when B settles first, then releases A after rejection', async () => {
    let rejectA!: (error: Error) => void;
    let resolveB!: () => void;
    const requestA = new Promise<void>((_resolve, reject) => {
      rejectA = reject;
    });
    const requestB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA)
      .mockReturnValueOnce(requestB)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            conversations: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useUploadedImages(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;
    const firstA = retainedA();
    const rejectedA = expect(firstA).rejects.toThrow('cursor A failed');

    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    resolveB();
    await firstB;
    await retainedA();
    expect(fetchMore).toHaveBeenCalledTimes(2);

    rejectA(new Error('cursor A failed'));
    await rejectedA;
    await retainedA();
    expect(fetchMore).toHaveBeenNthCalledWith(1, {
      variables: { after: 'cursor-a', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(2, {
      variables: { after: 'cursor-b', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(3, {
      variables: { after: 'cursor-a', first: 20 },
    });
  });
});

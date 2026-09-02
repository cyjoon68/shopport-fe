import { useApolloClient, useQuery } from '@apollo/client/react';
import { useChat, xhrHttpStream } from '@tanstack/ai-react';
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
    if (!('connect' in connection)) throw new Error('connect adapter unavailable');
    for await (const _chunk of connection.connect([])) void _chunk;
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

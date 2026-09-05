import { useApolloClient, useQuery } from '@apollo/client/react';
import { useChat, xhrHttpStream } from '@tanstack/ai-react';
import { act, render } from '@testing-library/react-native';
import {
  type ComponentProps,
  createElement as mockCreateElement,
  type ReactNode,
} from 'react';
import { Alert, Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import {
  type AskUserSheet,
  cancelRunThenStop,
  type ChatComposer,
  type MessageList,
} from '@/features/chat';
import { ConversationDocument, ConversationsDocument } from '@/graphql/generated/graphql';
import { sqliteChatPersistence } from '@/shared/storage';

import { ConversationScreen } from './conversation-screen';

let mockComposerProps: ComponentProps<typeof ChatComposer> | undefined;
let mockAskUserSheetProps: ComponentProps<typeof AskUserSheet> | undefined;
let mockMessageListProps: ComponentProps<typeof MessageList> | undefined;
let mockConnectionOptions: (() => { body: Record<string, unknown> }) | undefined;
let mockChatConnection: Parameters<typeof useChat>[0]['connection'] | undefined;
let mockFinish: ((runId?: string | null) => void) | undefined;
let mockChunk: ((chunk: { runId?: string; type: string }) => void) | undefined;
let mockStreamError: ((error: Error) => void) | undefined;
let mockHistory: ReadonlyArray<unknown> = [];
let mockHistoryLoading = false;
let mockChatMessages: ReadonlyArray<unknown> = [];
let mockIsLoading = false;
let mockRunId: string | null = null;
const mockSendMessage = jest.fn<Promise<void>, [unknown]>();
const mockReload = jest.fn<Promise<void>, []>();
const mockStopChat = jest.fn();
const mockRefetchQueries = jest.fn();
const mockHistoryRefetch = jest.fn();
const mockTransportConnect = jest.fn();
const mockTransportJoinRun = jest.fn();
let mockSessionStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockRouteParams: Record<string, string> = {};
let mockBoundaryOnline: boolean | undefined;
let mockActiveAskUser: { id: string; request: { allowFreeText: boolean } } | null = null;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
  router: { push: jest.fn() },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('@apollo/client/react', () => ({
  useApolloClient: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock(
  '@tanstack/ai-react',
  () => ({
    useChat: jest.fn(),
    xhrHttpStream: jest.fn(
      (_url: string, options: () => { body: Record<string, unknown> }) => {
        mockConnectionOptions = options;
        return { connect: mockTransportConnect, joinRun: mockTransportJoinRun };
      },
    ),
  }),
  { virtual: true },
);

jest.mock('@/features/auth', () => ({
  getAccessToken: () => null,
  useSession: () => ({ status: mockSessionStatus }),
}));

jest.mock('@/providers/network-provider', () => ({
  NetworkBoundary: ({ children, online }: { children: ReactNode; online: boolean }) => {
    mockBoundaryOnline = online;
    return children;
  },
  useOnline: () => mockOnline,
}));

jest.mock('@/shared/storage', () => ({
  flushChatPersistence: jest.fn(() => Promise.resolve()),
  sqliteChatPersistence: {
    getItem: jest.fn(),
    setItem: jest.fn(),
  },
}));

jest.mock('@/features/chat', () => ({
  ASK_USER_SKIP_MESSAGE: '질문을 건너뛰고 현재 정보로 계속 진행해줘.',
  AskUserSheet: (props: ComponentProps<typeof AskUserSheet>) => {
    mockAskUserSheetProps = props;
    return mockCreateElement(mockText, { testID: 'ask-user-sheet' }, 'ask-user');
  },
  cancelRunThenStop: jest.fn(),
  ChatComposer: (props: ComponentProps<typeof ChatComposer>) => {
    mockComposerProps = props;
    return mockCreateElement(mockText, { testID: 'chat-composer' }, 'composer');
  },
  chatErrorPresentation: () => ({ message: '오류', route: null }),
  createStableChatMessageId: () => 'message-1',
  MessageList: (props: ComponentProps<typeof MessageList>) => {
    mockMessageListProps = props;
    return null;
  },
  activeAskUserRequest: () => mockActiveAskUser,
  fromHistoricalMessage: (message: unknown) => message,
  fromLiveMessage: (message: unknown) => message,
  mergeDisplayMessages: (
    history: ReadonlyArray<unknown>,
    messages: ReadonlyArray<unknown>,
  ) => [...history, ...messages],
}));

const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedUseApolloClient = useApolloClient as jest.MockedFunction<
  typeof useApolloClient
>;
const mockedUseChat = useChat as jest.MockedFunction<typeof useChat>;
const mockedXhrHttpStream = xhrHttpStream as jest.MockedFunction<typeof xhrHttpStream>;
const mockedCancelRunThenStop = jest.mocked(cancelRunThenStop);
const mockedPersistence = jest.mocked(sqliteChatPersistence);
const mockedAlert = jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());

const startMockRun = async (runId: string): Promise<void> => {
  const connection = mockChatConnection;
  if (!connection || !('send' in connection)) throw new Error('send adapter unavailable');
  await connection.send([], undefined, undefined, {
    runId,
    threadId: 'conversation-1',
  });
};

describe('conversation screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComposerProps = undefined;
    mockAskUserSheetProps = undefined;
    mockMessageListProps = undefined;
    mockConnectionOptions = undefined;
    mockChatConnection = undefined;
    mockFinish = undefined;
    mockChunk = undefined;
    mockStreamError = undefined;
    mockHistory = [];
    mockHistoryLoading = false;
    mockChatMessages = [];
    mockIsLoading = false;
    mockRunId = null;
    mockSessionStatus = 'authenticated';
    mockOnline = true;
    mockRouteParams = {};
    mockBoundaryOnline = undefined;
    mockActiveAskUser = null;
    mockSendMessage.mockReset();
    mockReload.mockReset().mockResolvedValue(undefined);
    mockStopChat.mockReset();
    mockedCancelRunThenStop.mockReset().mockResolvedValue('cancelled');
    mockRefetchQueries.mockReset().mockResolvedValue([]);
    mockHistoryRefetch.mockReset().mockResolvedValue(undefined);
    mockedAlert.mockClear();
    mockTransportConnect.mockReset().mockImplementation(async function* () {});
    mockTransportJoinRun.mockReset().mockImplementation(async function* () {});
    mockedPersistence.getItem.mockReset().mockResolvedValue(null);
    mockedPersistence.setItem.mockReset().mockResolvedValue(undefined);
    mockedUseApolloClient.mockReturnValue({
      refetchQueries: mockRefetchQueries,
    } as unknown as ReturnType<typeof useApolloClient>);
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: { conversation: { messages: mockHistory } },
          refetch: mockHistoryRefetch,
          loading: mockHistoryLoading,
        }) as unknown as ReturnType<typeof useQuery>,
    );
    mockedUseChat.mockImplementation((options) => {
      mockChatConnection = options.connection;
      mockFinish = (runId = mockRunId) => {
        if (runId) options.onChunk?.({ runId, type: 'RUN_FINISHED' } as never);
        options.onFinish?.({} as never);
      };
      mockChunk = (chunk) => options.onChunk?.(chunk as never);
      mockStreamError = (error) => options.onError?.(error);
      return {
        error: undefined,
        isLoading: mockIsLoading,
        messages: mockChatMessages,
        runId: mockRunId,
        reload: mockReload,
        sendMessage: mockSendMessage,
        stop: mockStopChat,
      } as unknown as ReturnType<typeof useChat>;
    });
  });

  it('renders no private or cached conversation content while booting', () => {
    mockSessionStatus = 'booting';

    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    expect(screen.queryByTestId('conversation-screen')).toBeNull();
    expect(screen.queryByTestId('chat-composer')).toBeNull();
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedUseChat).not.toHaveBeenCalled();
  });

  it('mounts one stream client on the first authenticated render after booting', () => {
    mockSessionStatus = 'booting';
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    mockSessionStatus = 'authenticated';
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(1);
  });

  it('mounts one stream client on the first authenticated render after guest', () => {
    mockSessionStatus = 'guest';
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    mockSessionStatus = 'authenticated';
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(1);
  });

  it('mounts one stream client when a route ID first becomes available online', () => {
    const screen = render(<ConversationScreen />);

    mockRouteParams = { id: 'conversation-1' };
    act(() => screen.rerender(<ConversationScreen />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(1);
  });

  it('redirects guests before private hooks or content mount', () => {
    mockSessionStatus = 'guest';

    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedUseChat).not.toHaveBeenCalled();
  });

  it('enables conversation history remotely for online authenticated sessions', () => {
    render(<ConversationScreen conversationId="conversation-1" />);

    expect(mockedUseQuery).toHaveBeenCalledWith(ConversationDocument, {
      fetchPolicy: 'cache-and-network',
      skip: false,
      variables: { id: 'conversation-1' },
    });
    expect(mockBoundaryOnline).toBe(true);
  });

  it('renders offline-authenticated local state with its GraphQL query skipped', () => {
    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;
    mockActiveAskUser = { id: 'ask-1', request: { allowFreeText: true } };

    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    expect(screen.getByTestId('conversation-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('chat-composer')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(ConversationDocument, {
      fetchPolicy: 'cache-and-network',
      skip: true,
      variables: { id: 'conversation-1' },
    });
    expect(mockBoundaryOnline).toBe(false);
    expect(screen.queryByTestId('ask-user-sheet')).toBeNull();
  });

  it('rejoins once when an offline-authenticated conversation becomes authenticated', () => {
    mockSessionStatus = 'offline-authenticated';
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    mockSessionStatus = 'authenticated';
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(2);
  });

  it('stops mounted transport and blocks a retained finish refetch after going offline', () => {
    const screen = render(<ConversationScreen conversationId="conversation-1" />);
    const retainedFinish = mockFinish;

    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<ConversationScreen conversationId="conversation-1" />);
    retainedFinish?.();

    expect(mockStopChat).toHaveBeenCalledTimes(1);
    expect(mockRefetchQueries).not.toHaveBeenCalled();
  });

  it.each<SessionStatus>(['guest', 'booting'])(
    'blocks retained remote work when an authenticated conversation becomes %s',
    (status) => {
      const screen = render(<ConversationScreen conversationId="conversation-1" />);
      const retainedFinish = mockFinish;
      const retainedComposerProps = mockComposerProps as
        | (ComponentProps<typeof ChatComposer> & {
            remoteWorkRef?: { current: boolean };
          })
        | undefined;

      mockSessionStatus = status;
      screen.rerender(<ConversationScreen conversationId="conversation-1" />);
      retainedFinish?.();

      expect(retainedComposerProps?.remoteWorkRef?.current).toBe(false);
      expect(mockRefetchQueries).not.toHaveBeenCalled();
      expect(screen.queryByTestId('conversation-screen')).toBeNull();
    },
  );

  it('hides quick actions once the conversation has content', () => {
    mockHistory = [{ id: 'message-1' }];

    render(<ConversationScreen conversationId="conversation-1" />);

    expect(mockComposerProps?.quickActionsEnabled).toBe(false);
  });

  it('waits for conversation history before showing quick actions', () => {
    mockHistoryLoading = true;

    render(<ConversationScreen conversationId="conversation-1" />);

    expect(mockComposerProps?.quickActionsEnabled).toBe(false);
  });

  it('forwards an oliveyoung selection and resets it only after a completed reply', async () => {
    const onProviderReset = jest.fn();
    let body: Record<string, unknown> | undefined;
    mockSendMessage.mockImplementation(async () => {
      body = mockConnectionOptions?.().body;
      await startMockRun('run-1');
      mockFinish?.('run-1');
    });
    render(
      <ConversationScreen
        conversationId="conversation-1"
        onProviderReset={onProviderReset}
        providerIds={['oliveyoung']}
      />,
    );

    await act(async () => {
      await mockComposerProps?.onSend('립밤 찾아줘', null);
    });

    expect(body).toEqual({ assetId: null, providerIds: ['oliveyoung'] });
    expect(onProviderReset).toHaveBeenCalledTimes(1);
  });

  it('keeps the selection when the reply does not complete', async () => {
    const onProviderReset = jest.fn();
    mockSendMessage.mockResolvedValue(undefined);
    render(
      <ConversationScreen
        conversationId="conversation-1"
        onProviderReset={onProviderReset}
        providerIds={['oliveyoung']}
      />,
    );

    await act(async () => {
      await mockComposerProps?.onSend('립밤 찾아줘', null);
    });

    expect(onProviderReset).not.toHaveBeenCalled();
  });

  it('stops a generating reply before replacing the composer draft', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    let finishCancellation!: () => void;
    mockedCancelRunThenStop.mockReturnValueOnce(
      new Promise<'cancelled'>((resolve) => {
        finishCancellation = () => resolve('cancelled');
      }),
    );
    render(<ConversationScreen conversationId="conversation-1" />);
    let edit: Promise<void> | undefined;

    act(() => {
      edit = mockMessageListProps?.onEditMessage?.('이전 질문');
    });

    expect(
      (
        mockComposerProps as
          | (ComponentProps<typeof ChatComposer> & {
              draftReplacement?: Readonly<{ text: string }>;
            })
          | undefined
      )?.draftReplacement,
    ).toBeNull();

    await act(async () => {
      finishCancellation();
      await edit;
    });

    expect(mockedCancelRunThenStop).toHaveBeenCalledWith(
      'conversation-1',
      'run-1',
      mockStopChat,
      expect.any(Function),
    );
    expect(
      (
        mockComposerProps as ComponentProps<typeof ChatComposer> & {
          draftReplacement?: Readonly<{ text: string }>;
        }
      ).draftReplacement,
    ).toEqual({ text: '이전 질문' });
  });

  it('keeps a cancelled question in the conversation and retries its existing message', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    const recovery = mockMessageListProps?.recovery;
    expect(recovery?.question).toBe('토너 패드 최저가 찾아줘');

    await act(async () => {
      recovery?.onRetry();
      await Promise.resolve();
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('keeps retry recovery when reload resolves after reporting a stream error', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    mockReload.mockImplementation(() => {
      mockStreamError?.(new Error('retry transport failed'));
      return Promise.resolve();
    });
    render(<ConversationScreen conversationId="conversation-1" />);
    await act(async () => {
      await mockComposerProps?.onStop();
    });
    const recovery = mockMessageListProps?.recovery;

    await act(async () => {
      recovery?.onRetry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockMessageListProps?.recovery?.question).toBe('립밤 찾아줘');
    expect(mockMessageListProps?.recovery?.reason).toBe('failed');
    expect(mockedAlert).toHaveBeenCalledWith('다시 검색 실패', '오류');
  });

  it('offers retry and edit recovery for a general stream error', () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    render(<ConversationScreen conversationId="conversation-1" />);

    act(() => {
      mockChunk?.({ runId: 'run-1', type: 'RUN_ERROR' });
      mockStreamError?.(new Error('stream failed'));
    });

    expect(mockMessageListProps?.recovery).toEqual(
      expect.objectContaining({
        question: '립밤 찾아줘',
        reason: 'failed',
      }),
    );
    expect(mockMessageListProps?.recovery?.onEdit).toEqual(expect.any(Function));
    expect(mockMessageListProps?.recovery?.onRetry).toEqual(expect.any(Function));
  });

  it('signals composer cleanup after a failed send retry succeeds', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockSendMessage.mockImplementation(() => {
      mockStreamError?.(new Error('stream failed'));
      return Promise.resolve();
    });
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await expect(mockComposerProps?.onSend('립밤 찾아줘', 'asset-1')).rejects.toThrow(
        'stream failed',
      );
    });
    const recovery = mockMessageListProps?.recovery;
    expect(recovery?.reason).toBe('failed');

    mockOnline = false;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    mockOnline = true;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    await act(async () => {
      mockMessageListProps?.recovery?.onRetry();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      (
        mockComposerProps as
          | (ComponentProps<typeof ChatComposer> & {
              retryCleanup?: Readonly<{
                assetId: string | null;
                revision: number;
                text: string;
              }>;
            })
          | undefined
      )?.retryCleanup,
    ).toEqual({
      assetId: 'asset-1',
      revision: 1,
      text: '립밤 찾아줘',
    });
  });

  it('removes only a cancelled run resume while retaining its persisted messages', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    mockedPersistence.getItem.mockResolvedValue({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
    } as never);
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockedPersistence.setItem).toHaveBeenCalledWith('conversation-1', {
      messages: [{ id: 'message-1' }],
    });
  });

  it('shows terminal recovery when persistence cleanup rejects after cancellation', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    mockedPersistence.getItem.mockRejectedValue(new Error('sqlite unavailable'));
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');
  });

  it('reconciles history without recovery when completion wins cancellation', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    mockedCancelRunThenStop.mockResolvedValue('completed');
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockFinish).toBeDefined();
    expect(mockHistoryRefetch).toHaveBeenCalledTimes(1);
    expect(mockMessageListProps?.recovery).toBeUndefined();
    expect(mockedPersistence.setItem).not.toHaveBeenCalled();
  });

  it('does not display cancellation recovery when completed reconciliation fails', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    mockedCancelRunThenStop.mockResolvedValue('completed');
    mockHistoryRefetch.mockRejectedValue(new Error('network unavailable'));
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockMessageListProps?.recovery).toBeUndefined();
    expect(mockedAlert).toHaveBeenCalledWith(
      '응답 상태 확인 실패',
      '완료된 응답을 확인하지 못했어요. 다시 시도해 주세요.',
    );
  });

  it('shows failure recovery and clears stale resume when failure wins without a run error', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    mockedCancelRunThenStop.mockResolvedValue('failed');
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockHistoryRefetch).not.toHaveBeenCalled();
    expect(mockMessageListProps?.recovery?.message).toBe('검색에 실패했어요');
    expect(mockMessageListProps?.recovery?.reason).toBe('failed');
    expect(mockedPersistence.getItem).toHaveBeenCalledWith('conversation-1');
    await act(async () => {
      mockMessageListProps?.recovery?.onRetry();
      await Promise.resolve();
    });
    expect(mockReload).toHaveBeenCalledTimes(1);
  });

  it('keeps terminal recovery through an offline reconnect remount', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');

    mockOnline = false;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    mockOnline = true;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');
  });

  it('does not expose a cancelled recovery in a different conversation', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '토너 패드 최저가 찾아줘',
        tools: [],
      },
    ];
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');

    act(() => screen.rerender(<ConversationScreen conversationId="conversation-2" />));

    expect(mockMessageListProps?.recovery).toBeUndefined();
  });

  it('joins a deferred persisted run exactly once across an offline reconnect', async () => {
    let resolveInitialHydration!: (state: unknown) => void;
    const initialHydration = new Promise<unknown>((resolve) => {
      resolveInitialHydration = resolve;
    });
    const persisted = {
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
    };
    mockedPersistence.getItem
      .mockReturnValueOnce(initialHydration as never)
      .mockResolvedValue(persisted as never);
    const hydratedConnections = new Set<unknown>();
    mockedUseChat.mockImplementation((options) => {
      if (!hydratedConnections.has(options.connection)) {
        hydratedConnections.add(options.connection);
        const persistence = options.persistence;
        if (persistence && typeof persistence === 'object' && 'getItem' in persistence) {
          const getItem = persistence.getItem as (id: string) => unknown;
          void Promise.resolve(getItem('conversation-1')).then(async (state) => {
            if (
              Array.isArray(state) ||
              !state ||
              typeof state !== 'object' ||
              !('resume' in state) ||
              !state.resume
            )
              return;
            const resume = state.resume as { resumeState: { runId: string } };
            const connection = options.connection;
            if (!connection || !('joinRun' in connection) || !connection.joinRun) return;
            for await (const _chunk of connection.joinRun(resume.resumeState.runId))
              void _chunk;
          });
        }
      }
      mockFinish = (runId = 'run-1') => {
        if (runId) options.onChunk?.({ runId, type: 'RUN_FINISHED' } as never);
        options.onFinish?.({} as never);
      };
      mockChunk = (chunk) => options.onChunk?.(chunk as never);
      return {
        error: undefined,
        isLoading: mockIsLoading,
        messages: mockChatMessages,
        runId: mockRunId,
        reload: mockReload,
        sendMessage: mockSendMessage,
        stop: mockStopChat,
      } as unknown as ReturnType<typeof useChat>;
    });
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    mockOnline = false;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    mockOnline = true;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    resolveInitialHydration(persisted);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockTransportJoinRun).toHaveBeenCalledTimes(1);
  });

  it.each(['cancelled', 'completed', 'failed'] as const)(
    'strips a %s tombstone from reconnect hydration while cleanup is deferred',
    async (outcome) => {
      let resolveCleanupRead!: (state: unknown) => void;
      const cleanupRead = new Promise<unknown>((resolve) => {
        resolveCleanupRead = resolve;
      });
      const persisted = {
        messages: [{ id: 'message-1' }],
        resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      };
      mockIsLoading = true;
      mockRunId = 'run-1';
      mockChatMessages = [
        {
          askUsers: [],
          id: 'message-1',
          images: [],
          products: [],
          recommendations: [],
          role: 'user',
          status: 'COMPLETED',
          text: '토너 패드 최저가 찾아줘',
          tools: [],
        },
      ];
      mockedPersistence.getItem
        .mockReturnValueOnce(cleanupRead as never)
        .mockResolvedValue(persisted as never);
      mockedCancelRunThenStop.mockResolvedValue(outcome);
      const hydratedConnections = new Set<unknown>();
      let hydratedState: unknown;
      mockedUseChat.mockImplementation((options) => {
        if (!hydratedConnections.has(options.connection)) {
          hydratedConnections.add(options.connection);
          if (hydratedConnections.size > 1) {
            const persistence = options.persistence;
            if (
              persistence &&
              typeof persistence === 'object' &&
              'getItem' in persistence
            ) {
              const getItem = persistence.getItem as (id: string) => unknown;
              void Promise.resolve(getItem('conversation-1')).then(async (state) => {
                hydratedState = state;
                if (
                  Array.isArray(state) ||
                  !state ||
                  typeof state !== 'object' ||
                  !('resume' in state) ||
                  !state.resume
                )
                  return;
                const resume = state.resume as { resumeState: { runId: string } };
                const connection = options.connection;
                if (!connection || !('joinRun' in connection) || !connection.joinRun)
                  return;
                for await (const _chunk of connection.joinRun(resume.resumeState.runId))
                  void _chunk;
              });
            }
          }
        }
        mockChatConnection = options.connection;
        mockFinish = () => options.onFinish?.({} as never);
        mockChunk = (chunk) => options.onChunk?.(chunk as never);
        return {
          error: undefined,
          isLoading: mockIsLoading,
          messages: mockChatMessages,
          reload: mockReload,
          runId: mockRunId,
          sendMessage: mockSendMessage,
          stop: mockStopChat,
        } as unknown as ReturnType<typeof useChat>;
      });
      const screen = render(<ConversationScreen conversationId="conversation-1" />);

      await act(async () => {
        await mockComposerProps?.onStop();
      });
      if (outcome === 'completed') {
        expect(mockHistoryRefetch).toHaveBeenCalledTimes(1);
        expect(mockMessageListProps?.recovery).toBeUndefined();
      } else {
        expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');
      }
      mockOnline = false;
      act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
      mockOnline = true;
      act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
      await act(async () => {
        await Promise.resolve();
      });
      resolveCleanupRead(persisted);
      await act(async () => {
        await Promise.resolve();
      });

      expect(mockTransportJoinRun).not.toHaveBeenCalled();
      expect(hydratedState).toEqual({ messages: [{ id: 'message-1' }] });
      if (outcome !== 'completed')
        expect(mockMessageListProps?.recovery?.question).toBe('토너 패드 최저가 찾아줘');
    },
  );

  it('keeps the stream initializer while offline and recreates it once when reconnecting', () => {
    const screen = render(<ConversationScreen conversationId="conversation-1" />);
    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(1);

    mockOnline = false;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(1);
    mockOnline = true;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(2);
  });

  it('creates one stream client when switching conversations', () => {
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    act(() => screen.rerender(<ConversationScreen conversationId="conversation-2" />));

    expect(mockedXhrHttpStream).toHaveBeenCalledTimes(2);
  });

  it('restores the cancelled run context before retrying its existing message', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveSend!: () => void;
    const sending = new Promise<void>((resolve) => {
      resolveSend = resolve;
    });
    let retryBody: Record<string, unknown> | undefined;
    mockSendMessage.mockReturnValue(sending);
    mockReload.mockImplementation(() => {
      retryBody = mockConnectionOptions?.().body;
      return Promise.resolve();
    });
    mockedCancelRunThenStop.mockImplementation((_thread, _run, stop) => {
      stop();
      resolveSend();
      return Promise.resolve('cancelled');
    });
    render(
      <ConversationScreen conversationId="conversation-1" providerIds={['oliveyoung']} />,
    );
    let send: Promise<void> | undefined;
    act(() => {
      send = mockComposerProps?.onSend('립밤 찾아줘', 'asset-1');
    });

    await act(async () => {
      await startMockRun('run-1');
      await mockComposerProps?.onStop();
      await send;
    });
    const recovery = mockMessageListProps?.recovery;

    act(() => recovery?.onRetry());
    await act(async () => {
      await Promise.resolve();
    });

    expect(retryBody).toEqual({ assetId: 'asset-1', providerIds: ['oliveyoung'] });
    expect(mockConnectionOptions?.().body).toEqual({ assetId: null });
  });

  it('submits one retry and retains its context when recovery is double-tapped', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveReload!: () => void;
    const retrying = new Promise<void>((resolve) => {
      resolveReload = resolve;
    });
    let retryBody: Record<string, unknown> | undefined;
    mockReload.mockImplementation(() => {
      retryBody = mockConnectionOptions?.().body;
      return retrying;
    });
    const screen = render(
      <ConversationScreen conversationId="conversation-1" providerIds={['oliveyoung']} />,
    );
    await act(async () => {
      await mockComposerProps?.onSend('립밤 찾아줘', 'asset-1');
      await startMockRun('run-1');
      await mockComposerProps?.onStop();
    });
    const recovery = mockMessageListProps?.recovery;

    act(() => {
      recovery?.onRetry();
      recovery?.onRetry();
    });

    expect(mockReload).toHaveBeenCalledTimes(1);
    expect(retryBody).toEqual({ assetId: 'asset-1', providerIds: ['oliveyoung'] });
    await act(async () => {
      resolveReload();
      await retrying;
    });
    expect(mockConnectionOptions?.().body).toEqual({ assetId: null });
    expect(screen.getByTestId('conversation-screen')).toBeTruthy();
  });

  it('keeps a newer cancellation recovery when an earlier retry finishes', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '첫 번째 립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveReload!: () => void;
    const firstRetry = new Promise<void>((resolve) => {
      resolveReload = resolve;
    });
    mockReload.mockReturnValue(firstRetry);
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    act(() => mockMessageListProps?.recovery?.onRetry());
    mockRunId = 'run-b';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-b',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '두 번째 립밤 찾아줘',
        tools: [],
      },
    ];
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    await act(async () => {
      await mockComposerProps?.onStop();
    });
    expect(mockMessageListProps?.recovery?.question).toBe('두 번째 립밤 찾아줘');
    expect(mockMessageListProps?.recovery?.retrying).toBeFalsy();

    await act(async () => {
      resolveReload();
      await firstRetry;
    });

    expect(mockMessageListProps?.recovery?.question).toBe('두 번째 립밤 찾아줘');
  });

  it('preserves asset and provider context through reconnect before cancelling and retrying', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let retryBody: Record<string, unknown> | undefined;
    mockReload.mockImplementation(() => {
      retryBody = mockConnectionOptions?.().body;
      return Promise.resolve();
    });
    const screen = render(
      <ConversationScreen conversationId="conversation-1" providerIds={['oliveyoung']} />,
    );

    await act(async () => {
      await mockComposerProps?.onSend('립밤 찾아줘', 'asset-1');
    });
    mockOnline = false;
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    mockOnline = true;
    act(() =>
      screen.rerender(
        <ConversationScreen
          conversationId="conversation-1"
          providerIds={['oliveyoung']}
        />,
      ),
    );
    await act(async () => {
      await mockComposerProps?.onStop();
    });
    const recovery = mockMessageListProps?.recovery;

    act(() => recovery?.onRetry());
    await act(async () => {
      await Promise.resolve();
    });

    expect(retryBody).toEqual({ assetId: 'asset-1', providerIds: ['oliveyoung'] });
  });

  it('restores a persisted run context after cold hydration before cancelling and retrying', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    mockedPersistence.getItem.mockResolvedValue({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    } as never);
    let hydrated = false;
    mockedUseChat.mockImplementation((options) => {
      if (!hydrated) {
        hydrated = true;
        const persistence = options.persistence;
        if (persistence && typeof persistence === 'object' && 'getItem' in persistence)
          void Promise.resolve(persistence.getItem('conversation-1'));
      }
      mockChatConnection = options.connection;
      mockFinish = (runId = 'run-1') => {
        if (runId) options.onChunk?.({ runId, type: 'RUN_FINISHED' } as never);
        options.onFinish?.({} as never);
      };
      mockChunk = (chunk) => options.onChunk?.(chunk as never);
      return {
        error: undefined,
        isLoading: mockIsLoading,
        messages: mockChatMessages,
        reload: mockReload,
        runId: mockRunId,
        sendMessage: mockSendMessage,
        stop: mockStopChat,
      } as unknown as ReturnType<typeof useChat>;
    });
    let retryBody: Record<string, unknown> | undefined;
    mockReload.mockImplementation(() => {
      retryBody = mockConnectionOptions?.().body;
      return Promise.resolve();
    });
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await mockComposerProps?.onStop();
    });
    act(() => mockMessageListProps?.recovery?.onRetry());
    await act(async () => {
      await Promise.resolve();
    });

    expect(retryBody).toEqual({ assetId: 'asset-1', providerIds: ['oliveyoung'] });
    expect(screen.getByTestId('conversation-screen')).toBeTruthy();
  });

  it('clears persisted run transport context before skipping a completed ask-user prompt', async () => {
    mockActiveAskUser = {
      id: 'ask-1',
      request: { allowFreeText: false },
    };
    mockedPersistence.getItem.mockResolvedValue({
      messages: [{ id: 'message-1' }],
      resume: { resumeState: { runId: 'run-1', threadId: 'conversation-1' } },
      shopportRunContext: {
        assetId: 'asset-1',
        conversationId: 'conversation-1',
        providerIds: ['oliveyoung'],
        runId: 'run-1',
      },
    } as never);
    let hydrated = false;
    mockedUseChat.mockImplementation((options) => {
      if (!hydrated) {
        hydrated = true;
        const persistence = options.persistence;
        if (persistence && typeof persistence === 'object' && 'getItem' in persistence)
          void Promise.resolve(persistence.getItem('conversation-1'));
      }
      mockChatConnection = options.connection;
      mockFinish = (runId = 'run-1') => {
        if (runId) options.onChunk?.({ runId, type: 'RUN_FINISHED' } as never);
        options.onFinish?.({} as never);
      };
      mockChunk = (chunk) => options.onChunk?.(chunk as never);
      return {
        error: undefined,
        isLoading: mockIsLoading,
        messages: mockChatMessages,
        reload: mockReload,
        runId: 'run-1',
        sendMessage: mockSendMessage,
        stop: mockStopChat,
      } as unknown as ReturnType<typeof useChat>;
    });
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await Promise.resolve();
    });
    act(() => mockFinish?.());
    await act(async () => {
      await mockAskUserSheetProps?.onDismiss();
    });

    expect(mockSendMessage).toHaveBeenCalledWith(
      { content: '질문을 건너뛰고 현재 정보로 계속 진행해줘.', id: 'message-1' },
      { whenBusy: 'queue' },
    );
    expect(mockConnectionOptions?.().body).toEqual({ assetId: null });
  });

  it('does not show stale recovery when the response finishes during cancellation', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveCancellation!: () => void;
    mockedCancelRunThenStop.mockReturnValue(
      new Promise<'cancelled'>((resolve) => {
        resolveCancellation = () => resolve('cancelled');
      }),
    );
    render(<ConversationScreen conversationId="conversation-1" />);
    let cancel!: Promise<void>;

    act(() => {
      cancel = mockComposerProps?.onStop() as Promise<void>;
    });
    act(() => mockFinish?.());
    await act(async () => {
      resolveCancellation();
      await cancel;
    });

    expect(mockMessageListProps?.recovery).toBeUndefined();
  });

  it('does not let an old cancellation stop a new send before its run starts', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '이전 질문',
        tools: [],
      },
    ];
    let finishCancellation!: () => void;
    mockedCancelRunThenStop.mockImplementation(
      (_threadId, _runId, stop, isCurrentRun) =>
        new Promise<'cancelled'>((resolve) => {
          finishCancellation = () => {
            if (isCurrentRun?.()) stop();
            resolve('cancelled');
          };
        }),
    );
    let finishSend!: () => void;
    mockSendMessage.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      }),
    );
    render(<ConversationScreen conversationId="conversation-1" />);
    let cancellation!: Promise<void>;
    let sending!: Promise<void>;

    act(() => {
      cancellation = mockComposerProps?.onStop() as Promise<void>;
    });
    act(() => {
      sending = mockComposerProps?.onSend('새 질문', 'asset-b') as Promise<void>;
    });
    await act(async () => {
      finishCancellation();
      await cancellation;
    });

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(mockStopChat).not.toHaveBeenCalled();
    expect(mockMessageListProps?.recovery).toBeUndefined();

    await act(async () => {
      finishSend();
      await sending;
    });
  });

  it('ignores run A finish after send B starts but before its run ID arrives', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '이전 질문',
        tools: [],
      },
    ];
    let finishSend!: () => void;
    mockSendMessage.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      }),
    );
    const onProviderReset = jest.fn();
    render(
      <ConversationScreen
        conversationId="conversation-1"
        onProviderReset={onProviderReset}
      />,
    );
    let sending!: Promise<void>;

    act(() => {
      sending = mockComposerProps?.onSend('새 질문', null) as Promise<void>;
    });
    act(() => {
      mockFinish?.('run-a');
    });
    await act(async () => {
      finishSend();
      await sending;
    });

    expect(onProviderReset).not.toHaveBeenCalled();
  });

  it('keeps a late run A error from failing send B after run B starts', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '이전 질문',
        tools: [],
      },
    ];
    let finishSend!: () => void;
    mockSendMessage.mockReturnValue(
      new Promise<void>((resolve) => {
        finishSend = resolve;
      }),
    );
    render(<ConversationScreen conversationId="conversation-1" />);
    let sending!: Promise<void>;

    act(() => {
      sending = mockComposerProps?.onSend('새 질문', null) as Promise<void>;
    });
    await act(async () => {
      const connection = mockChatConnection;
      if (!connection || !('send' in connection))
        throw new Error('send adapter unavailable');
      await connection.send([], undefined, undefined, {
        runId: 'run-b',
        threadId: 'conversation-1',
      });
    });
    act(() => {
      mockChunk?.({ runId: 'run-a', type: 'RUN_ERROR' });
      mockStreamError?.(new Error('run A failed'));
    });

    expect(mockMessageListProps?.recovery).toBeUndefined();
    const sendResult = expect(sending).resolves.toBeUndefined();
    await act(async () => {
      finishSend();
      await sendResult;
    });
  });

  it('does not stop or alert after an in-flight cancellation owner unmounts', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '이전 질문',
        tools: [],
      },
    ];
    let failCancellation!: () => void;
    mockedCancelRunThenStop.mockImplementation(
      (_threadId, _runId, stop, isCurrentRun) =>
        new Promise<'cancelled'>((_resolve, reject) => {
          failCancellation = () => {
            if (isCurrentRun?.()) stop();
            reject(new Error('late cancel failure'));
          };
        }),
    );
    const screen = render(<ConversationScreen conversationId="conversation-1" />);
    let cancellation!: Promise<void>;

    act(() => {
      cancellation = mockComposerProps?.onStop() as Promise<void>;
    });
    screen.unmount();
    await act(async () => {
      failCancellation();
      await cancellation;
    });

    expect(mockStopChat).not.toHaveBeenCalled();
    expect(mockedAlert).not.toHaveBeenCalledWith('응답 중지 실패', 'late cancel failure');
  });

  it('stops the local client once when cancellation is double-tapped', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-a',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '이전 질문',
        tools: [],
      },
    ];
    let finishCancellation!: () => void;
    const remoteCancellation = new Promise<'cancelled'>((resolve) => {
      finishCancellation = () => resolve('cancelled');
    });
    mockedCancelRunThenStop.mockImplementation(
      async (_threadId, _runId, stop, isCurrentRun) => {
        const outcome = await remoteCancellation;
        if (isCurrentRun?.()) stop();
        return outcome;
      },
    );
    render(<ConversationScreen conversationId="conversation-1" />);
    let first!: Promise<void>;
    let second!: Promise<void>;

    act(() => {
      first = mockComposerProps?.onStop() as Promise<void>;
      second = mockComposerProps?.onStop() as Promise<void>;
    });
    await act(async () => {
      finishCancellation();
      await Promise.all([first, second]);
    });

    expect(mockStopChat).toHaveBeenCalledTimes(1);
  });

  it('keeps the active run ID through a null render before cancellation finishes', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveCancellation!: () => void;
    mockedCancelRunThenStop.mockReturnValue(
      new Promise<'cancelled'>((resolve) => {
        resolveCancellation = () => resolve('cancelled');
      }),
    );
    const screen = render(<ConversationScreen conversationId="conversation-1" />);
    let cancel!: Promise<void>;

    act(() => {
      cancel = mockComposerProps?.onStop() as Promise<void>;
    });
    mockRunId = null;
    screen.rerender(<ConversationScreen conversationId="conversation-1" />);
    act(() => mockFinish?.('run-1'));
    await act(async () => {
      resolveCancellation();
      await cancel;
    });

    expect(mockMessageListProps?.recovery).toBeUndefined();
  });

  it('removes recovery when the response finishes after cancellation', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    expect(mockMessageListProps?.recovery?.question).toBe('립밤 찾아줘');

    act(() => mockFinish?.());

    expect(mockMessageListProps?.recovery).toBeUndefined();
  });

  it('ignores a cancelled run finish after a retry starts a newer run', async () => {
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    const screen = render(<ConversationScreen conversationId="conversation-1" />);

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    const recovery = mockMessageListProps?.recovery;
    mockRunId = 'run-b';
    act(() => screen.rerender(<ConversationScreen conversationId="conversation-1" />));
    act(() => recovery?.onRetry());
    await act(async () => {
      await startMockRun('run-b');
      await Promise.resolve();
    });
    act(() => {
      mockFinish?.('run-a');
    });

    await act(async () => {
      await mockComposerProps?.onStop();
    });

    expect(mockMessageListProps?.recovery?.question).toBe('립밤 찾아줘');
  });

  it('ignores a cancelled run finish once a retry transport starts before its run ID rerenders', async () => {
    const onProviderReset = jest.fn();
    mockIsLoading = true;
    mockRunId = 'run-a';
    mockChatMessages = [
      {
        askUsers: [],
        id: 'message-1',
        images: [],
        products: [],
        recommendations: [],
        role: 'user',
        status: 'COMPLETED',
        text: '립밤 찾아줘',
        tools: [],
      },
    ];
    let resolveReload!: () => void;
    mockReload.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveReload = resolve;
      }),
    );
    render(
      <ConversationScreen
        conversationId="conversation-1"
        onProviderReset={onProviderReset}
      />,
    );

    await act(async () => {
      await mockComposerProps?.onStop();
    });
    const recovery = mockMessageListProps?.recovery;
    act(() => recovery?.onRetry());
    const connection = mockChatConnection;
    if (!connection || !('send' in connection))
      throw new Error('chat connection unavailable');
    await act(async () => {
      await connection.send([], undefined, undefined, {
        runId: 'run-b',
        threadId: 'conversation-1',
      });
    });
    act(() => {
      mockFinish?.('run-a');
    });
    await act(async () => {
      resolveReload();
      await Promise.resolve();
    });

    expect(onProviderReset).not.toHaveBeenCalled();
  });

  it('keeps the latest edit when cancellations finish out of order', async () => {
    mockIsLoading = true;
    mockRunId = 'run-1';
    let finishFirstCancellation!: () => void;
    let finishSecondCancellation!: () => void;
    mockedCancelRunThenStop
      .mockReturnValueOnce(
        new Promise<'cancelled'>((resolve) => {
          finishFirstCancellation = () => resolve('cancelled');
        }),
      )
      .mockReturnValueOnce(
        new Promise<'cancelled'>((resolve) => {
          finishSecondCancellation = () => resolve('cancelled');
        }),
      );
    render(<ConversationScreen conversationId="conversation-1" />);
    let firstEdit: Promise<void> | undefined;
    let secondEdit: Promise<void> | undefined;

    act(() => {
      firstEdit = mockMessageListProps?.onEditMessage?.('첫 번째 질문');
      secondEdit = mockMessageListProps?.onEditMessage?.('두 번째 질문');
    });

    await act(async () => {
      finishSecondCancellation();
      await secondEdit;
    });

    expect(
      (
        mockComposerProps as ComponentProps<typeof ChatComposer> & {
          draftReplacement?: Readonly<{ text: string }>;
        }
      ).draftReplacement,
    ).toEqual({ text: '두 번째 질문' });

    await act(async () => {
      finishFirstCancellation();
      await firstEdit;
    });

    expect(
      (
        mockComposerProps as ComponentProps<typeof ChatComposer> & {
          draftReplacement?: Readonly<{ text: string }>;
        }
      ).draftReplacement,
    ).toEqual({ text: '두 번째 질문' });
  });

  it('refreshes recent conversations after the response finishes', () => {
    render(<ConversationScreen conversationId="conversation-1" />);

    act(() => mockFinish?.());

    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [ConversationsDocument],
    });
  });
});

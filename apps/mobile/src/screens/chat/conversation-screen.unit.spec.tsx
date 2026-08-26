import { useApolloClient, useQuery } from '@apollo/client/react';
import { useChat } from '@tanstack/ai-react';
import { act, render } from '@testing-library/react-native';
import {
  type ComponentProps,
  createElement as mockCreateElement,
  type ReactNode,
} from 'react';
import { Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import type { ChatComposer } from '@/features/chat';
import { ConversationDocument, ConversationsDocument } from '@/graphql/generated/graphql';

import { ConversationScreen } from './conversation-screen';

let mockComposerProps: ComponentProps<typeof ChatComposer> | undefined;
let mockConnectionOptions: (() => { body: Record<string, unknown> }) | undefined;
let mockFinish: (() => void) | undefined;
let mockHistory: ReadonlyArray<unknown> = [];
let mockHistoryLoading = false;
let mockChatMessages: ReadonlyArray<unknown> = [];
const mockSendMessage = jest.fn<Promise<void>, [unknown]>();
const mockRefetchQueries = jest.fn();
let mockSessionStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockBoundaryOnline: boolean | undefined;
let mockActiveAskUser: { id: string; request: { allowFreeText: boolean } } | null = null;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
  router: { push: jest.fn() },
  useLocalSearchParams: () => ({}),
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
        return {};
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
  sqliteChatPersistence: {},
}));

jest.mock('@/features/chat', () => ({
  ASK_USER_SKIP_MESSAGE: '질문을 건너뛰고 현재 정보로 계속 진행해줘.',
  AskUserSheet: () =>
    mockCreateElement(mockText, { testID: 'ask-user-sheet' }, 'ask-user'),
  cancelRunThenStop: jest.fn(),
  ChatComposer: (props: ComponentProps<typeof ChatComposer>) => {
    mockComposerProps = props;
    return mockCreateElement(mockText, { testID: 'chat-composer' }, 'composer');
  },
  chatErrorPresentation: () => ({ message: '오류', route: null }),
  createStableChatMessageId: () => 'message-1',
  MessageList: () => null,
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

describe('conversation screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockComposerProps = undefined;
    mockConnectionOptions = undefined;
    mockFinish = undefined;
    mockHistory = [];
    mockHistoryLoading = false;
    mockChatMessages = [];
    mockSessionStatus = 'authenticated';
    mockOnline = true;
    mockBoundaryOnline = undefined;
    mockActiveAskUser = null;
    mockSendMessage.mockReset();
    mockRefetchQueries.mockReset().mockResolvedValue([]);
    mockedUseApolloClient.mockReturnValue({
      refetchQueries: mockRefetchQueries,
    } as unknown as ReturnType<typeof useApolloClient>);
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: { conversation: { messages: mockHistory } },
          loading: mockHistoryLoading,
        }) as ReturnType<typeof useQuery>,
    );
    mockedUseChat.mockImplementation((options) => {
      mockFinish = () => options.onFinish?.({} as never);
      return {
        error: undefined,
        isLoading: false,
        messages: mockChatMessages,
        runId: null,
        sendMessage: mockSendMessage,
        stop: jest.fn(),
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
    mockSendMessage.mockImplementation(() => {
      body = mockConnectionOptions?.().body;
      mockFinish?.();
      return Promise.resolve();
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

  it('refreshes recent conversations after the response finishes', () => {
    render(<ConversationScreen conversationId="conversation-1" />);

    act(() => mockFinish?.());

    expect(mockRefetchQueries).toHaveBeenCalledWith({
      include: [ConversationsDocument],
    });
  });
});

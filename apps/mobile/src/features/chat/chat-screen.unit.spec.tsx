import { useMutation } from '@apollo/client/react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { print } from 'graphql';
import { createElement as mockCreateElement } from 'react';
import { Alert, Text as mockNativeText } from 'react-native';

import {
  ConversationsDocument,
  CreateConversationDocument,
} from '@/graphql/generated/graphql';

import { ChatScreen } from './chat-screen';
import type { ChatTab } from './chat-segmented-control';
import type { DisplayMessage } from './message-model';

const mockPush = jest.fn<void, [unknown]>();
const mockSetParams = jest.fn<void, [Record<string, string | undefined>]>();
const mockOpenDrawer = jest.fn<void, []>();
let mockSearchParams: { deletedConversationId?: string; id?: string } = {};
let mockTabChange: ((value: ChatTab) => void) | undefined;
let mockUnread: Readonly<Record<ChatTab, boolean>> | undefined;
let mockConversationOnMessagesChange:
  | ((messages: ReadonlyArray<DisplayMessage>) => void)
  | undefined;
let mockConversationOnProductSelect:
  | ((product: {
      id: string;
      title: string;
      imageUrl: string;
      providerId: string;
      providerName: string;
      amountMinor: string;
      shippingMinor: string;
      totalMinor: string;
      currency: string;
      isAffiliate: boolean;
      isInStock: boolean;
      outboundUrl: string;
      deliveryExpectedAt: string | null;
      observedAt: string;
      isSaved: boolean;
    }) => void)
  | undefined;
let mockFoundProductsRecommendations: DisplayMessage['recommendations'] | undefined;
let mockFoundProductsPresentation: 'catalog' | 'recommendations' | undefined;
let mockFoundProductsScope: 'all-conversations' | 'conversation' | undefined;
let mockFoundProductsRenderCount = 0;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: {
    push: (argument: unknown) => mockPush(argument),
    setParams: (params: Record<string, string | undefined>) => mockSetParams(params),
  },
  useLocalSearchParams: () => mockSearchParams,
  useNavigation: () => ({ openDrawer: mockOpenDrawer }),
}));

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: () => true,
}));

jest.mock('./chat-segmented-control', () => ({
  ChatSegmentedControl: ({
    onValueChange,
    unread,
    testID,
  }: {
    onValueChange: (value: ChatTab) => void;
    unread?: Readonly<Record<ChatTab, boolean>>;
    testID?: string;
  }) => {
    mockTabChange = onValueChange;
    mockUnread = unread;
    return mockCreateElement(mockNativeText, { testID }, 'tabs');
  },
}));

jest.mock('./conversation-screen', () => ({
  ConversationScreen: ({
    onMessagesChange,
    onProductSelect,
  }: {
    onMessagesChange?: (messages: ReadonlyArray<DisplayMessage>) => void;
    onProductSelect?: (product: {
      id: string;
      title: string;
      imageUrl: string;
      providerId: string;
      providerName: string;
      amountMinor: string;
      shippingMinor: string;
      totalMinor: string;
      currency: string;
      isAffiliate: boolean;
      isInStock: boolean;
      outboundUrl: string;
      deliveryExpectedAt: string | null;
      observedAt: string;
      isSaved: boolean;
    }) => void;
  }) => {
    mockConversationOnMessagesChange = onMessagesChange;
    mockConversationOnProductSelect = onProductSelect;
    return mockCreateElement(
      mockNativeText,
      { testID: 'conversation-screen' },
      'conversation',
    );
  },
}));

jest.mock('@/features/catalog/found-products-screen', () => {
  return {
    FoundProductsContent: ({
      conversationRecommendations,
      presentation,
      scope,
    }: {
      conversationRecommendations?: DisplayMessage['recommendations'];
      presentation?: 'catalog' | 'recommendations';
      scope?: 'all-conversations' | 'conversation';
    }) => {
      mockFoundProductsRenderCount += 1;
      mockFoundProductsRecommendations = conversationRecommendations;
      mockFoundProductsPresentation = presentation;
      mockFoundProductsScope = scope;
      return mockCreateElement(
        mockNativeText,
        { testID: 'found-products-content' },
        conversationRecommendations?.[0]?.product.title ?? '상품',
      );
    },
  };
});

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
}));

jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage/database', () => ({
  saveDraft: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/accessibility/use-reduced-transparency', () => ({
  useReducedTransparency: () => false,
}));

jest.mock('./asset-upload', () => ({
  selectAndUploadAsset: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(() => Promise.resolve()),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

describe('chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseMutation.mockReset();
    mockSearchParams = {};
    mockTabChange = undefined;
    mockUnread = undefined;
    mockConversationOnMessagesChange = undefined;
    mockConversationOnProductSelect = undefined;
    mockFoundProductsRecommendations = undefined;
    mockFoundProductsPresentation = undefined;
    mockFoundProductsScope = undefined;
    mockFoundProductsRenderCount = 0;
  });

  it('opens the drawer from the top-left menu button', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ]);
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('메뉴 열기'));

    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('opens saved products from the top-right button', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);

    fireEvent.press(screen.getByLabelText('저장한 상품 보기'));

    expect(mockPush).toHaveBeenCalledWith('/favorites');
  });

  it('shows image and send controls in the composer', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);

    expect(screen.getByLabelText('이미지 첨부')).toBeOnTheScreen();
    expect(screen.getByLabelText('메시지 보내기')).toBeOnTheScreen();
  });

  it('refreshes Drawer recent conversations after a conversation is created', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);

    render(<ChatScreen />);

    expect(mockedUseMutation).toHaveBeenCalledWith(
      CreateConversationDocument,
      expect.objectContaining({
        awaitRefetchQueries: true,
        refetchQueries: [ConversationsDocument],
      }),
    );
  });

  it('uses a literal recent-conversation page size below the server limit', () => {
    expect(print(ConversationsDocument)).toContain(
      'conversations(first: 20, after: $after)',
    );
  });

  it('switches to found products', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);

    act(() => mockTabChange?.('상품'));

    expect(screen.getByTestId('found-products-content')).toBeOnTheScreen();
  });

  it('does not rerender the product tab for streamed text-only updates', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockSearchParams = { id: 'conversation-1' };
    render(<ChatScreen />);
    const assistant = {
      askUsers: [],
      id: 'assistant-1',
      images: [],
      products: [],
      recommendations: [],
      role: 'assistant',
      status: 'PENDING',
      text: '첫 토큰',
      tools: [],
    } satisfies DisplayMessage;

    act(() => mockConversationOnMessagesChange?.([assistant]));
    const rendersAfterFirstToken = mockFoundProductsRenderCount;
    act(() =>
      mockConversationOnMessagesChange?.([{ ...assistant, text: '두 번째 토큰' }]),
    );

    expect(mockFoundProductsRenderCount).toBe(rendersAfterFirstToken);
  });

  it('shows conversation products on the products tab when FoundProducts query is empty', async () => {
    const createConversation = jest.fn().mockResolvedValue({
      data: {
        createConversation: {
          conversation: {
            id: 'conversation-1',
            title: '새 대화',
            createdAt: '2026-08-16T00:00:00.000Z',
            updatedAt: '2026-08-16T00:00:00.000Z',
          },
          userErrors: [],
        },
      },
    });
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '립밤');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('메시지 보내기'));
      await Promise.resolve();
    });
    const product = {
      id: 'product-1',
      title: '오릭스 립밤(무향)4.8 g',
      imageUrl: 'https://example.com/lipbalm.jpg',
      providerId: 'oliveyoung',
      providerName: '올리브영',
      amountMinor: '1000',
      shippingMinor: '0',
      totalMinor: '1000',
      currency: 'KRW',
      isAffiliate: false,
      isInStock: true,
      outboundUrl: 'https://www.oliveyoung.co.kr/product',
      deliveryExpectedAt: null,
      observedAt: '2026-08-17T00:00:00.000Z',
      isSaved: false,
    };
    const assistant = {
      askUsers: [],
      id: 'assistant-1',
      images: [],
      products: [product],
      recommendations: [
        {
          product,
          aiSummary: '무향이라 향에 민감한 입술에도 편하게 사용할 수 있습니다.',
        },
      ],
      role: 'assistant',
      status: 'COMPLETED',
      text: '립밤 추천',
      tools: [],
    } satisfies DisplayMessage;

    act(() => mockConversationOnMessagesChange?.([assistant]));
    expect(mockUnread?.상품).toBe(false);
    act(() => mockConversationOnProductSelect?.(product));
    expect(screen.getByTestId('found-products-content')).toHaveTextContent(product.title);
    expect(mockFoundProductsPresentation).toBe('recommendations');
    expect(mockFoundProductsScope).toBe('conversation');
    expect(mockFoundProductsRecommendations?.[0]?.aiSummary).toBe(
      '무향이라 향에 민감한 입술에도 편하게 사용할 수 있습니다.',
    );

    const nextAssistant = {
      ...assistant,
      id: 'assistant-2',
      products: [{ ...product, id: 'product-2', title: '다음 상품' }],
      recommendations: [
        {
          product: { ...product, id: 'product-2', title: '다음 상품' },
          aiSummary: '다음 추천 요약',
        },
      ],
    } satisfies DisplayMessage;
    act(() => mockTabChange?.('채팅'));
    act(() => mockConversationOnMessagesChange?.([assistant, nextAssistant]));

    expect(mockUnread?.상품).toBe(true);
  });

  it('shows a recoverable error when conversation creation rejects', async () => {
    const createConversation = jest.fn().mockRejectedValue(new Error('서버 오류'));
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ChatScreen />);

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '가벼운 텀블러');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('메시지 보내기'));
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('대화를 만들지 못했습니다', '서버 오류');
    expect(mockPush).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });

  it('keeps the conversation on the chat screen after creation', async () => {
    const createConversation = jest.fn().mockResolvedValue({
      data: {
        createConversation: {
          conversation: {
            id: 'conversation-1',
            title: '새 대화',
            createdAt: '2026-08-16T00:00:00.000Z',
            updatedAt: '2026-08-16T00:00:00.000Z',
          },
          userErrors: [],
        },
      },
    });
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '가벼운 텀블러');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('메시지 보내기'));
      await Promise.resolve();
    });

    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.getByTestId('conversation-screen')).toBeOnTheScreen();
  });

  it('resets a deleted active conversation to the default chat state', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockSearchParams = { id: 'conversation-1' };
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('conversation-screen')).toBeOnTheScreen();

    mockSearchParams = {
      deletedConversationId: 'conversation-1',
      id: 'conversation-1',
    };
    act(() => screen.rerender(<ChatScreen />));

    expect(screen.queryByTestId('conversation-screen')).toBeNull();
    expect(screen.getByLabelText('쇼핑 질문')).toBeOnTheScreen();
    expect(mockSetParams).toHaveBeenCalledWith({
      deletedConversationId: undefined,
      id: undefined,
    });
  });

  it('shows the default chat state for an empty conversation route id', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockSearchParams = { id: '' };
    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('conversation-screen')).toBeNull();
    expect(screen.getByLabelText('쇼핑 질문')).toBeOnTheScreen();
  });

  it('marks the inactive tab unread when new assistant content arrives', async () => {
    const createConversation = jest.fn().mockResolvedValue({
      data: {
        createConversation: {
          conversation: {
            id: 'conversation-1',
            title: '새 대화',
            createdAt: '2026-08-16T00:00:00.000Z',
            updatedAt: '2026-08-16T00:00:00.000Z',
          },
          userErrors: [],
        },
      },
    });
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<ChatScreen />);
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '텀블러');
    await act(async () => {
      fireEvent.press(screen.getByLabelText('메시지 보내기'));
      await Promise.resolve();
    });
    const assistant = {
      askUsers: [],
      id: 'assistant-1',
      images: [],
      products: [],
      recommendations: [],
      role: 'assistant',
      status: 'COMPLETED',
      text: '추천 결과',
      tools: [],
    } satisfies DisplayMessage;

    const initialAssistant = { ...assistant, id: 'assistant-initial' };
    act(() => mockConversationOnMessagesChange?.([initialAssistant]));
    act(() => mockTabChange?.('상품'));
    act(() => mockConversationOnMessagesChange?.([initialAssistant, assistant]));

    expect(mockUnread?.채팅).toBe(true);
    act(() => mockTabChange?.('채팅'));
    expect(mockUnread?.채팅).toBe(false);
  });
});

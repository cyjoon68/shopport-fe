import { useMutation } from '@apollo/client/react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { print } from 'graphql';
import {
  type ComponentType,
  createElement as mockCreateElement,
  Fragment as mockFragment,
  type ReactNode,
} from 'react';
import { Alert, Linking, Text as mockNativeText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import {
  type ChatTab,
  type DisplayMessage,
  removeUploadedAsset,
  selectAndUploadAsset,
} from '@/features/chat';
import {
  ConversationsDocument,
  CreateConversationDocument,
} from '@/graphql/generated/graphql';
import { saveDraft } from '@/shared/storage';

import { ChatScreen } from './chat-screen';

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
let mockConversationRemoteWorkRef: { current: boolean } | undefined;
let mockFoundProductsRecommendations: DisplayMessage['recommendations'] | undefined;
let mockFoundProductsPresentation: 'catalog' | 'recommendations' | undefined;
let mockFoundProductsScope: 'all-conversations' | 'conversation' | undefined;
let mockFoundProductsRenderCount = 0;
let mockSessionStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockEffectiveOnline: boolean | undefined;
const mockMutate = jest.fn();
const mockedRemoveUploadedAsset = jest.mocked(removeUploadedAsset);
const mockedSaveDraft = jest.mocked(saveDraft);
const mockedSelectAndUploadAsset = jest.mocked(selectAndUploadAsset);
const mockedImpactAsync = jest.mocked(Haptics.impactAsync);

const deferred = <T,>() => {
  let reject!: (error: Error) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    reject = rejectPromise;
    resolve = resolvePromise;
  });
  return { promise, reject, resolve };
};

const conversationMutationResult = {
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
};

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockNativeText, { testID: 'redirect' }, href),
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

jest.mock('@/features/chat/components/header/chat-segmented-control', () => ({
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
    remoteWorkRef,
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
    remoteWorkRef?: { current: boolean };
  }) => {
    mockConversationOnMessagesChange = onMessagesChange;
    mockConversationOnProductSelect = onProductSelect;
    mockConversationRemoteWorkRef = remoteWorkRef;
    return mockCreateElement(
      mockNativeText,
      { testID: 'conversation-screen' },
      'conversation',
    );
  },
}));

jest.mock('@/features/catalog', () => {
  const ProductCard = jest.requireActual<{
    ProductCard: ComponentType<{ product: DisplayMessage['products'][number] }>;
  }>('@/features/catalog/components/product-card').ProductCard;
  return {
    ProductList: ({
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
        mockFragment,
        null,
        mockCreateElement(
          mockNativeText,
          { testID: 'found-products-content' },
          conversationRecommendations?.[0]?.product.title ?? '상품',
        ),
        conversationRecommendations?.[0]
          ? mockCreateElement(ProductCard, {
              product: conversationRecommendations[0].product,
            })
          : null,
      );
    },
  };
});

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
}));

jest.mock(
  '@tanstack/ai-react',
  () => ({ useChat: jest.fn(), xhrHttpStream: jest.fn() }),
  { virtual: true },
);

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

jest.mock('@/providers/network-provider', () => ({
  NetworkBoundary: ({ children, online }: { children: ReactNode; online: boolean }) => {
    mockEffectiveOnline = online;
    return children;
  },
  useOnline: () => mockEffectiveOnline ?? mockOnline,
}));

jest.mock('@/shared/storage', () => ({
  cacheProducts: jest.fn(() => Promise.resolve()),
  saveDraft: jest.fn(() => Promise.resolve()),
}));

jest.mock('@/shared/accessibility/hooks', () => ({
  useReducedMotion: () => false,
  useReducedTransparency: () => false,
}));

jest.mock('@/features/chat/attachments', () => ({
  selectAndUploadAsset: jest.fn(),
}));

jest.mock('@/features/chat/api/fetchers', () => ({
  removeUploadedAsset: jest.fn(),
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
    mockedRemoveUploadedAsset.mockReset();
    mockedRemoveUploadedAsset.mockResolvedValue(undefined);
    mockedSaveDraft.mockReset();
    mockedSaveDraft.mockResolvedValue(undefined);
    mockedSelectAndUploadAsset.mockReset();
    mockedImpactAsync.mockReset();
    mockedImpactAsync.mockResolvedValue(undefined);
    mockSearchParams = {};
    mockTabChange = undefined;
    mockUnread = undefined;
    mockConversationOnMessagesChange = undefined;
    mockConversationOnProductSelect = undefined;
    mockConversationRemoteWorkRef = undefined;
    mockFoundProductsRecommendations = undefined;
    mockFoundProductsPresentation = undefined;
    mockFoundProductsScope = undefined;
    mockFoundProductsRenderCount = 0;
    mockSessionStatus = 'authenticated';
    mockOnline = true;
    mockEffectiveOnline = undefined;
    mockedUseMutation.mockReturnValue([
      mockMutate,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
  });

  it('renders no private or cached content while the session is booting', () => {
    mockSessionStatus = 'booting';

    const screen = render(<ChatScreen />);

    expect(screen.queryByTestId('chat-screen')).toBeNull();
    expect(screen.queryByTestId('found-products-content')).toBeNull();
    expect(mockedUseMutation).not.toHaveBeenCalled();
  });

  it('redirects guests before private hooks or content mount', () => {
    mockSessionStatus = 'guest';

    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(screen.queryByTestId('chat-screen')).toBeNull();
    expect(mockedUseMutation).not.toHaveBeenCalled();
  });

  it('keeps mounted bootstrap transitions behind the effective network boundary', () => {
    mockSessionStatus = 'booting';
    const screen = render(<ChatScreen />);
    expect(screen.queryByTestId('chat-screen')).toBeNull();

    mockSessionStatus = 'guest';
    screen.rerender(<ChatScreen />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');

    mockSessionStatus = 'authenticated';
    screen.rerender(<ChatScreen />);
    expect(screen.getByTestId('chat-screen')).toBeOnTheScreen();

    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<ChatScreen />);
    expect(screen.getByLabelText('메시지 보내기')).toBeDisabled();
  });

  it('updates the existing conversation remote policy before an early session return', () => {
    mockSearchParams = { id: 'conversation-1' };
    const screen = render(<ChatScreen />);
    const retainedRemoteWorkRef = mockConversationRemoteWorkRef;

    expect(retainedRemoteWorkRef?.current).toBe(true);
    mockSessionStatus = 'guest';
    screen.rerender(<ChatScreen />);

    expect(retainedRemoteWorkRef?.current).toBe(false);
  });

  it('permits remote conversation work only for an online authenticated session', () => {
    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat-screen')).toBeOnTheScreen();
    expect(mockedUseMutation).toHaveBeenCalledWith(
      CreateConversationDocument,
      expect.any(Object),
    );
  });

  it('renders the offline-authenticated cache surface without enabling actions', () => {
    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;

    const screen = render(<ChatScreen />);

    expect(screen.getByTestId('chat-screen')).toBeOnTheScreen();
    expect(screen.getByLabelText('메시지 보내기')).toBeDisabled();
    act(() => mockTabChange?.('상품'));
    expect(screen.getByTestId('found-products-content')).toBeOnTheScreen();
  });

  it('blocks cached product actions when a mounted chat becomes offline-authenticated', () => {
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    mockSearchParams = { id: 'conversation-1' };
    const screen = render(<ChatScreen />);
    const product = {
      id: 'product-1',
      title: '립밤',
      imageUrl: 'https://example.com/lipbalm.jpg',
      providerId: 'oliveyoung',
      providerName: '올리브영',
      amountMinor: '3000',
      shippingMinor: '0',
      totalMinor: '3000',
      currency: 'KRW',
      isAffiliate: false,
      isInStock: true,
      outboundUrl: 'https://example.com/product',
      deliveryExpectedAt: null,
      observedAt: '2026-08-26T00:00:00.000Z',
      isSaved: false,
    } as const;
    act(() =>
      mockConversationOnMessagesChange?.([
        {
          askUsers: [],
          id: 'assistant-1',
          images: [],
          products: [product],
          recommendations: [{ product, aiSummary: '추천' }],
          role: 'assistant',
          status: 'COMPLETED',
          text: '추천',
          tools: [],
        },
      ]),
    );
    act(() => mockConversationOnProductSelect?.(product));

    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<ChatScreen />);
    fireEvent.press(screen.getByLabelText('립밤 찜'));
    fireEvent.press(screen.getByLabelText('립밤 구매 링크'));

    expect(mockMutate).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
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

  it('keeps a conversation creation error separate from image upload errors', async () => {
    const createConversation = jest.fn().mockResolvedValue({
      data: {
        createConversation: {
          conversation: null,
          userErrors: [{ message: '대화를 만들 수 없습니다.' }],
        },
      },
    });
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ChatScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이미지 첨부'));
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith(
      '대화를 만들지 못했습니다',
      '대화를 만들 수 없습니다.',
    );
    alertSpy.mockRestore();
  });

  it('cleans an uploaded asset when draft handoff rejects without masking the error', async () => {
    const createConversation = jest.fn().mockResolvedValue(conversationMutationResult);
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockedSelectAndUploadAsset.mockResolvedValue({
      id: 'asset-1',
      uri: 'file://asset-1.png',
    });
    mockedSaveDraft.mockRejectedValue(new Error('초안을 저장하지 못했습니다.'));
    mockedRemoveUploadedAsset.mockRejectedValue(new Error('cleanup unavailable'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ChatScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이미지 첨부'));
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(mockedRemoveUploadedAsset).toHaveBeenCalledWith('asset-1'),
    );
    expect(alertSpy).toHaveBeenCalledWith(
      '이미지 첨부 실패',
      '초안을 저장하지 못했습니다.',
    );
    expect(screen.queryByTestId('conversation-screen')).toBeNull();
  });

  it('cleans an upload that resolves after ChatContent unmounts without stale work', async () => {
    const createConversation = jest.fn().mockResolvedValue(conversationMutationResult);
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const upload = deferred<{ id: string; uri: string } | null>();
    mockedSelectAndUploadAsset.mockReturnValue(upload.promise);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ChatScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이미지 첨부'));
      await Promise.resolve();
    });
    expect(mockedSelectAndUploadAsset).toHaveBeenCalledWith('conversation-1');
    screen.unmount();

    await act(async () => {
      upload.resolve({ id: 'asset-stale', uri: 'file://asset-stale.png' });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mockedRemoveUploadedAsset).toHaveBeenCalledWith('asset-stale');
    expect(mockedSaveDraft).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it.each([
    { nextStatus: 'guest', surface: 'guest' },
    { nextStatus: 'booting', surface: 'booting' },
  ] as const)(
    'does no remote or local continuation after authenticated-to-$surface transition',
    async ({ nextStatus }) => {
      const createConversation = jest.fn().mockResolvedValue(conversationMutationResult);
      mockedUseMutation.mockReturnValue([
        createConversation,
        { called: false, client: {}, loading: false, reset: jest.fn() },
      ] as ReturnType<typeof useMutation>);
      const upload = deferred<{ id: string; uri: string } | null>();
      mockedSelectAndUploadAsset.mockReturnValue(upload.promise);
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
      const screen = render(<ChatScreen />);

      await act(async () => {
        fireEvent.press(screen.getByLabelText('이미지 첨부'));
        await Promise.resolve();
      });
      expect(mockedSelectAndUploadAsset).toHaveBeenCalledWith('conversation-1');

      mockSessionStatus = nextStatus;
      screen.rerender(<ChatScreen />);
      await act(async () => {
        upload.resolve({ id: `asset-${nextStatus}`, uri: 'file://asset.png' });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockedRemoveUploadedAsset).not.toHaveBeenCalled();
      expect(mockedSaveDraft).not.toHaveBeenCalled();
      expect(mockedImpactAsync).not.toHaveBeenCalled();
      expect(screen.queryByTestId('conversation-screen')).toBeNull();
      expect(alertSpy).not.toHaveBeenCalled();
    },
  );

  it('does not start abandoned-asset cleanup after the effective policy goes offline', async () => {
    const createConversation = jest.fn().mockResolvedValue(conversationMutationResult);
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockedSelectAndUploadAsset.mockResolvedValue({
      id: 'asset-offline',
      uri: 'file://asset-offline.png',
    });
    const handoff = deferred<void>();
    mockedSaveDraft.mockReturnValue(handoff.promise);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<ChatScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이미지 첨부'));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockedSaveDraft).toHaveBeenCalledTimes(1));
    mockSessionStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<ChatScreen />);

    await act(async () => {
      handoff.reject(new Error('초안을 저장하지 못했습니다.'));
      await Promise.resolve();
    });

    expect(mockedRemoveUploadedAsset).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      '이미지 첨부 실패',
      '초안을 저장하지 못했습니다.',
    );
  });

  it('transfers asset ownership after draft handoff before later UI work', async () => {
    const createConversation = jest.fn().mockResolvedValue(conversationMutationResult);
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    mockedSelectAndUploadAsset.mockResolvedValue({
      id: 'asset-handed-off',
      uri: 'file://asset-handed-off.png',
    });
    mockedImpactAsync.mockRejectedValue(new Error('haptic unavailable'));
    const screen = render(<ChatScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('이미지 첨부'));
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() =>
      expect(screen.getByTestId('conversation-screen')).toBeOnTheScreen(),
    );
    expect(mockedSaveDraft).toHaveBeenCalledWith('conversation-1', {
      assetId: 'asset-handed-off',
      assetUri: 'file://asset-handed-off.png',
      text: '',
    });
    expect(mockedRemoveUploadedAsset).not.toHaveBeenCalled();
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

import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, Text as mockNativeText } from 'react-native';
import { createElement as mockCreateElement } from 'react';
import { useMutation } from '@apollo/client/react';
import { ChatScreen } from './chat-screen';
import type { ChatTab } from './chat-segmented-control';
import type { DisplayMessage } from './message-list';

const mockPush = jest.fn<void, [unknown]>();
const mockOpenDrawer = jest.fn<void, []>();
let mockTabChange: ((value: ChatTab) => void) | undefined;
let mockUnread: Readonly<Record<ChatTab, boolean>> | undefined;
let mockConversationOnMessagesChange:
  | ((messages: ReadonlyArray<DisplayMessage>) => void)
  | undefined;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: (argument: unknown) => mockPush(argument) },
  useLocalSearchParams: () => ({}),
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
  }: {
    onMessagesChange?: (messages: ReadonlyArray<DisplayMessage>) => void;
  }) => {
    mockConversationOnMessagesChange = onMessagesChange;
    return mockCreateElement(
      mockNativeText,
      { testID: 'conversation-screen' },
      'conversation',
    );
  },
}));

jest.mock('@/features/catalog/found-products-screen', () => {
  return {
    FoundProductsContent: () =>
      mockCreateElement(mockNativeText, { testID: 'found-products-content' }, '상품'),
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
    mockTabChange = undefined;
    mockUnread = undefined;
    mockConversationOnMessagesChange = undefined;
  });

  it('opens the drawer from the top-left menu button', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
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
      role: 'assistant',
      status: 'COMPLETED',
      text: '추천 결과',
      tools: [],
    } satisfies DisplayMessage;

    act(() => mockConversationOnMessagesChange?.([]));
    act(() => mockTabChange?.('상품'));
    act(() => mockConversationOnMessagesChange?.([assistant]));

    expect(mockUnread?.채팅).toBe(true);
    act(() => mockTabChange?.('채팅'));
    expect(mockUnread?.채팅).toBe(false);
  });
});

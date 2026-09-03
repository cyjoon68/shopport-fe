import { useMutation, useQuery } from '@apollo/client/react';
import {
  act,
  fireEvent,
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import {
  createElement as mockCreateElement,
  type ReactNode,
  type Ref,
  useImperativeHandle as mockUseImperativeHandle,
  useState as mockUseState,
} from 'react';
import {
  Alert,
  Platform as mockPlatform,
  Pressable as mockPressable,
  View as mockView,
} from 'react-native';

import {
  DeleteConversationDocument,
  RenameConversationDocument,
} from '@/graphql/generated/graphql';

import { ShopportDrawerContent } from './shopport-drawer-content';

const mockCloseDrawer = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();
const mockFetchMore = jest.fn();
const mockRefetch = jest.fn();
const mockRenameConversation = jest.fn();
const mockDeleteConversation = jest.fn();
let mockOnline = true;
let mockSessionStatus = 'authenticated';
let mockConversationEdges: ReadonlyArray<unknown> = [];
let mockPageInfo = { endCursor: null as string | null, hasNextPage: false };

const createDeferred = <T,>() => {
  let reject!: (error: Error) => void;
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle, fail) => {
    reject = fail;
    resolve = settle;
  });
  return { promise, reject, resolve };
};

jest.mock('expo-router', () => {
  const Link = Object.assign(
    ({ children }: { children: ReactNode }) =>
      mockCreateElement(mockView, null, children),
    {
      Menu: ({ children }: { children: ReactNode }) =>
        mockPlatform.OS === 'android'
          ? null
          : mockCreateElement(mockView, null, children),
      MenuAction: ({ onPress, title }: { onPress: () => void; title: string }) =>
        mockCreateElement(
          mockPressable,
          { accessibilityLabel: title, accessibilityRole: 'button', onPress },
          title,
        ),
      Preview: () => null,
      Trigger: ({ children }: { children: ReactNode }) => children,
    },
  );
  return {
    Link,
    router: {
      push: (href: unknown): void => {
        mockPush(href);
      },
      replace: (href: unknown): void => {
        mockReplace(href);
      },
      setParams: (params: unknown): void => {
        mockSetParams(params);
      },
    },
  };
});

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: ({
    actions,
    children,
    onPressAction,
    ref,
  }: {
    actions: ReadonlyArray<Readonly<{ id: string; title: string }>>;
    children: ReactNode;
    onPressAction: (
      event: Readonly<{ nativeEvent: Readonly<{ event: string }> }>,
    ) => void;
    ref?: Ref<Readonly<{ show: () => void }>>;
  }) => {
    const [open, setOpen] = mockUseState(false);
    mockUseImperativeHandle(ref, () => ({ show: () => setOpen(true) }));
    return mockCreateElement(
      mockView,
      null,
      children,
      open
        ? actions.map(({ id, title }) =>
            mockCreateElement(
              mockPressable,
              {
                accessibilityLabel: title,
                accessibilityRole: 'button',
                key: id,
                onPress: () => {
                  setOpen(false);
                  onPressAction({ nativeEvent: { event: id } });
                },
              },
              title,
            ),
          )
        : null,
    );
  },
}));

jest.mock('expo-router/drawer', () => ({ DrawerContentScrollView: 'View' }));
jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  cancelAnimation: jest.fn(),
  default: { View: mockView, createAnimatedComponent: (component: unknown) => component },
  runOnJS: (action: (...args: ReadonlyArray<unknown>) => unknown) => action,
  useAnimatedStyle: jest.fn(() => ({})),
  useSharedValue: jest.fn((value: unknown) => ({
    get: () => value,
    set: jest.fn(),
    value,
  })),
  withTiming: (value: unknown) => value,
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: mockSessionStatus }),
}));

jest.mock('@/providers/network-provider', () => ({ useOnline: () => mockOnline }));

jest.mock('@/shared/storage', () => ({
  deleteDraft: jest.fn(() => Promise.resolve()),
  readPinnedConversationIds: jest.fn(() => Promise.resolve([])),
  setConversationPinned: jest.fn(() => Promise.resolve()),
  sqliteChatPersistence: { removeItem: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/shared/components', () => ({
  GlassButton: ({
    accessibilityLabel,
    children,
    onPress,
  }: {
    accessibilityLabel?: string;
    children: ReactNode;
    onPress: () => void;
  }) => mockCreateElement(mockPressable, { accessibilityLabel, onPress }, children),
  glassButtonIconSize: 16,
  PlatformIcon: () => null,
  platformIconSources: { delete: 1, edit: 2, 'pin-filled': 3 },
}));

const mockedUseMutation = jest.mocked(useMutation);
const mockedUseQuery = jest.mocked(useQuery);

const drawerProps = {
  navigation: { closeDrawer: mockCloseDrawer },
} as unknown as DrawerContentComponentProps;

const conversationNode = {
  __typename: 'Conversation',
  createdAt: '2026-08-26T00:00:00Z',
  id: 'conversation-1',
  title: '기존 이름',
  updatedAt: '2026-08-26T00:00:00Z',
};

const originalOS = mockPlatform.OS;

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  jest.spyOn(Alert, 'prompt').mockImplementation(() => undefined);
  mockOnline = true;
  mockSessionStatus = 'authenticated';
  mockConversationEdges = [];
  mockPageInfo = { endCursor: null, hasNextPage: false };
  mockFetchMore.mockResolvedValue(undefined);
  mockRefetch.mockResolvedValue(undefined);
  mockRenameConversation.mockResolvedValue({
    data: { renameConversation: { conversation: conversationNode, userErrors: [] } },
  });
  mockDeleteConversation.mockResolvedValue({
    data: { deleteConversation: { success: true, userErrors: [] } },
  });
  mockedUseQuery.mockImplementation(
    () =>
      ({
        data: {
          conversations: { edges: mockConversationEdges, pageInfo: mockPageInfo },
        },
        fetchMore: mockFetchMore,
        refetch: mockRefetch,
      }) as never,
  );
  mockedUseMutation.mockImplementation(
    (document) =>
      [
        document === RenameConversationDocument
          ? mockRenameConversation
          : document === DeleteConversationDocument
            ? mockDeleteConversation
            : jest.fn(),
      ] as never,
  );
});

afterEach(() =>
  Object.defineProperty(mockPlatform, 'OS', { configurable: true, value: originalOS }),
);

describe('shopport drawer content', () => {
  it('clears the active conversation before opening a new chat', async () => {
    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    fireEvent.press(screen.getByLabelText('새로운 대화 열기'));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockSetParams).toHaveBeenCalledWith({
      deletedConversationId: undefined,
      id: undefined,
    });
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('opens settings from the drawer header', async () => {
    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    fireEvent.press(screen.getByLabelText('설정 열기'));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });

  it('opens a text-input rename dialog instead of a platform prompt', async () => {
    mockConversationEdges = [{ cursor: 'edge-1', node: conversationNode }];
    const user = userEvent.setup();
    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    await user.press(screen.getByRole('button', { name: '이름 바꾸기' }));

    expect(screen.getByLabelText('대화 이름')).toHaveDisplayValue('기존 이름');
    expect(Alert.prompt).not.toHaveBeenCalled();
  });

  it('opens conversation actions from an Android long press', async () => {
    Object.defineProperty(mockPlatform, 'OS', { configurable: true, value: 'android' });
    mockConversationEdges = [{ cursor: 'edge-1', node: conversationNode }];
    const user = userEvent.setup();

    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    expect(screen.queryByRole('button', { name: '이름 바꾸기' })).toBeNull();
    await user.longPress(screen.getByRole('button', { name: conversationNode.title }));
    expect(screen.getByRole('button', { name: '삭제' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: '이름 바꾸기' }));

    expect(screen.getByLabelText('대화 이름')).toHaveDisplayValue('기존 이름');
    expect(screen.queryByRole('button', { name: '삭제' })).toBeNull();
  });

  it('keeps the normal Android conversation tap available', async () => {
    Object.defineProperty(mockPlatform, 'OS', { configurable: true, value: 'android' });
    mockConversationEdges = [{ cursor: 'edge-1', node: conversationNode }];
    const user = userEvent.setup();

    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    await user.press(screen.getByRole('button', { name: conversationNode.title }));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: '이름 바꾸기' })).toBeNull();
  });

  it('reserves Android accessibility activation for navigation', async () => {
    Object.defineProperty(mockPlatform, 'OS', { configurable: true, value: 'android' });
    mockConversationEdges = [{ cursor: 'edge-1', node: conversationNode }];

    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    fireEvent(
      screen.getByRole('button', { name: conversationNode.title }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'activate' } },
    );
    expect(screen.queryByRole('button', { name: '이름 바꾸기' })).toBeNull();
    fireEvent(
      screen.getByRole('button', { name: conversationNode.title }),
      'accessibilityAction',
      { nativeEvent: { actionName: 'longpress' } },
    );

    expect(screen.getByRole('button', { name: '이름 바꾸기' })).toBeOnTheScreen();
  });

  it('suppresses a duplicate next-page request for the active cursor', async () => {
    let resolveFetchMore!: () => void;
    mockPageInfo = { endCursor: 'cursor-1', hasNextPage: true };
    mockFetchMore.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFetchMore = resolve;
        }),
    );
    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());
    const nextPage = screen.getByRole('button', { name: '대화 더 불러오기' });

    fireEvent.press(nextPage);
    fireEvent.press(nextPage);

    expect(mockFetchMore).toHaveBeenCalledTimes(1);
    resolveFetchMore();
    await waitFor(() => expect(mockFetchMore).toHaveBeenCalledTimes(1));
  });

  it('alerts when loading the next conversation page rejects', async () => {
    mockPageInfo = { endCursor: 'cursor-1', hasNextPage: true };
    mockFetchMore.mockRejectedValueOnce(new Error('pagination failed'));
    const user = userEvent.setup();
    render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());

    await user.press(screen.getByRole('button', { name: '대화 더 불러오기' }));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '대화 불러오기 실패',
        '다시 시도해 주세요.',
      ),
    );
  });

  it('suppresses an in-flight page failure after drawer unmount', async () => {
    const pagination = createDeferred<void>();
    mockPageInfo = { endCursor: 'cursor-1', hasNextPage: true };
    mockFetchMore.mockReturnValueOnce(pagination.promise);
    const user = userEvent.setup();
    const view = render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());
    await user.press(screen.getByRole('button', { name: '대화 더 불러오기' }));
    jest.mocked(Alert.alert).mockClear();

    view.unmount();
    await act(async () => {
      pagination.reject(new Error('pagination failed'));
      await pagination.promise.catch(() => undefined);
    });

    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it.each(['network', 'session'] as const)(
    'suppresses an in-flight page failure after %s disablement and releases its cursor',
    async (policy) => {
      const pagination = createDeferred<void>();
      mockPageInfo = { endCursor: 'cursor-1', hasNextPage: true };
      mockFetchMore.mockReturnValueOnce(pagination.promise);
      const user = userEvent.setup();
      const view = render(<ShopportDrawerContent {...drawerProps} />);
      await act(async () => Promise.resolve());
      await user.press(screen.getByRole('button', { name: '대화 더 불러오기' }));
      jest.mocked(Alert.alert).mockClear();

      if (policy === 'network') mockOnline = false;
      else mockSessionStatus = 'unauthenticated';
      view.rerender(<ShopportDrawerContent {...drawerProps} />);
      await act(async () => {
        pagination.reject(new Error('pagination failed'));
        await pagination.promise.catch(() => undefined);
      });

      expect(Alert.alert).not.toHaveBeenCalled();
      mockOnline = true;
      mockSessionStatus = 'authenticated';
      mockFetchMore.mockResolvedValueOnce(undefined);
      view.rerender(<ShopportDrawerContent {...drawerProps} />);
      await user.press(screen.getByRole('button', { name: '대화 더 불러오기' }));
      expect(mockFetchMore).toHaveBeenCalledTimes(2);
    },
  );

  it('blocks a retained next-page callback after remote reads are disabled', async () => {
    mockPageInfo = { endCursor: 'cursor-1', hasNextPage: true };
    const view = render(<ShopportDrawerContent {...drawerProps} />);
    await act(async () => Promise.resolve());
    const nextPage = screen.getByRole('button', { name: '대화 더 불러오기' });

    mockOnline = false;
    view.rerender(<ShopportDrawerContent {...drawerProps} />);
    fireEvent.press(nextPage);

    expect(mockFetchMore).not.toHaveBeenCalled();
  });
});

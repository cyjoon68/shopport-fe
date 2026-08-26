import { act, fireEvent, render } from '@testing-library/react-native';
import type { DrawerContentComponentProps } from 'expo-router/drawer';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { Pressable as mockPressable } from 'react-native';

import { ShopportDrawerContent } from './shopport-drawer-content';

const mockCloseDrawer = jest.fn();
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockSetParams = jest.fn();

jest.mock('expo-router', () => ({
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
}));

jest.mock('expo-router/drawer', () => ({
  DrawerContentScrollView: 'View',
}));

jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@apollo/client/react', () => ({
  useQuery: () => ({
    data: { conversations: { edges: [] } },
    refetch: jest.fn(),
  }),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage/database', () => ({
  readPinnedConversationIds: () => Promise.resolve([]),
}));

jest.mock('@/shared/ui/glass-button', () => ({
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
}));

describe('shopport drawer content', () => {
  beforeEach(() => jest.clearAllMocks());

  it('clears the active conversation before opening a new chat', async () => {
    const props = {
      navigation: { closeDrawer: mockCloseDrawer },
    } as unknown as DrawerContentComponentProps;
    const screen = render(<ShopportDrawerContent {...props} />);
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
    const props = {
      navigation: { closeDrawer: mockCloseDrawer },
    } as unknown as DrawerContentComponentProps;
    const screen = render(<ShopportDrawerContent {...props} />);
    await act(async () => Promise.resolve());

    fireEvent.press(screen.getByLabelText('설정 열기'));

    expect(mockCloseDrawer).toHaveBeenCalledTimes(1);
    expect(mockPush).toHaveBeenCalledWith('/settings');
  });
});

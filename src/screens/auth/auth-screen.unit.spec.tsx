import { act, fireEvent, render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import {
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from 'react-native';

import type { SessionStatus } from '@/features/auth';

import { AuthScreen } from './auth-screen';

const mockLogin = jest.fn<Promise<void>, []>();
let mockStatus: SessionStatus = 'guest';
let mockError: string | null = null;
let mockLoginPress: (() => void) | undefined;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({
    error: mockError,
    login: mockLogin,
    logout: jest.fn(),
    status: mockStatus,
  }),
}));

jest.mock('@/shared/components', () => ({
  Screen: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    mockCreateElement(mockView, { testID }, children),
  GlassActionButton: ({
    children,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress: () => void;
  }) => {
    mockLoginPress = onPress;
    return mockCreateElement(
      mockPressable,
      {
        accessibilityLabel: typeof children === 'string' ? children : undefined,
        accessibilityRole: 'button',
        disabled,
        onPress,
      },
      mockCreateElement(mockText, null, children),
    );
  },
}));

describe('auth screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockReset().mockResolvedValue(undefined);
    mockStatus = 'guest';
    mockError = null;
    mockLoginPress = undefined;
  });

  it('shows a labelled spinner while the session is booting', () => {
    mockStatus = 'booting';
    const screen = render(<AuthScreen />);

    expect(screen.getByLabelText('세션 확인 중')).toBeOnTheScreen();
    expect(screen.queryByLabelText('카카오로 시작하기')).toBeNull();
  });

  it.each<SessionStatus>(['authenticated', 'offline-authenticated'])(
    'redirects %s sessions to the private app',
    (nextStatus) => {
      mockStatus = nextStatus;
      const screen = render(<AuthScreen />);

      expect(screen.getByTestId('redirect')).toHaveTextContent('/');
      expect(screen.queryByLabelText('카카오로 시작하기')).toBeNull();
    },
  );

  it('shows the guest login action and provider error', () => {
    mockError = '카카오 로그인에 실패했습니다.';
    const screen = render(<AuthScreen />);

    expect(screen.getByLabelText('카카오로 시작하기')).toBeOnTheScreen();
    expect(screen.getByText(mockError)).toBeOnTheScreen();
  });

  it('recovers after a rejected login', async () => {
    mockLogin
      .mockRejectedValueOnce(new Error('cancelled'))
      .mockResolvedValueOnce(undefined);
    const screen = render(<AuthScreen />);

    await act(async () => {
      fireEvent.press(screen.getByLabelText('카카오로 시작하기'));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.press(screen.getByLabelText('카카오로 시작하기'));
      await Promise.resolve();
    });

    expect(mockLogin).toHaveBeenCalledTimes(2);
  });

  it('suppresses duplicate taps before a render commits', async () => {
    let resolveLogin: (() => void) | undefined;
    mockLogin.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveLogin = resolve;
      }),
    );
    const screen = render(<AuthScreen />);

    screen.getByLabelText('카카오로 시작하기');
    act(() => {
      mockLoginPress?.();
      mockLoginPress?.();
    });

    expect(mockLogin).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLogin?.();
      await Promise.resolve();
    });
  });
});

import { useMutation, useQuery } from '@apollo/client/react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from 'react-native';

import { kakaoAccountEmail } from '@/features/auth/native-auth';

import { SettingsScreen } from './settings-screen';

const mockLogout = jest.fn();
const mockUpdateViewer = jest.fn();
const mockDeleteAccount = jest.fn();
const mockOpenUrl = jest.spyOn(Linking, 'openURL');
let mockMutationCall = 0;

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { replace: jest.fn() },
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock('@/features/auth/native-auth', () => ({
  kakaoAccountEmail: jest.fn(),
}));

jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ logout: mockLogout, status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({ useOnline: () => true }));

jest.mock('@/shared/config/environment', () => ({
  environment: { privacyPolicyUrl: 'https://example.com/privacy' },
}));

jest.mock('@shopport/ui', () => ({
  Screen: ({ children }: { children: ReactNode }) =>
    mockCreateElement(mockView, null, children),
  SectionTitle: ({ children }: { children: ReactNode }) =>
    mockCreateElement(mockText, null, children),
}));

jest.mock('@/shared/ui/glass-button', () => ({
  GlassActionButton: ({
    children,
    disabled,
    onPress,
  }: {
    children: ReactNode;
    disabled?: boolean;
    onPress: () => void;
  }) =>
    mockCreateElement(
      mockPressable,
      {
        accessibilityLabel: typeof children === 'string' ? children : undefined,
        disabled,
        onPress,
      },
      mockCreateElement(mockText, null, children),
    ),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedKakaoAccountEmail = kakaoAccountEmail as jest.MockedFunction<
  typeof kakaoAccountEmail
>;

describe('settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue({
      data: { viewer: { displayName: '기존 닉네임' } },
    } as unknown as ReturnType<typeof useQuery>);
    mockedUseMutation.mockReset();
    mockMutationCall = 0;
    mockedUseMutation.mockImplementation(
      () =>
        (mockMutationCall++ % 2 === 0
          ? [mockUpdateViewer, { loading: false }]
          : [mockDeleteAccount, { loading: false }]) as never,
    );
    mockedKakaoAccountEmail.mockResolvedValue('shopper@example.com');
    mockUpdateViewer.mockResolvedValue({
      data: {
        updateViewer: {
          userErrors: [],
          viewer: { displayName: '새 닉네임', id: 'viewer-1' },
        },
      },
    });
    mockOpenUrl.mockResolvedValue(true);
    mockLogout.mockResolvedValue(undefined);
    mockDeleteAccount.mockResolvedValue({
      data: { deleteViewerAccount: { success: true, userErrors: [] } },
    });
  });

  it('updates the nickname and displays the Kakao account email', async () => {
    const screen = render(<SettingsScreen />);
    await waitFor(() => {
      expect(screen.getByText('shopper@example.com')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByLabelText('닉네임'), '  새 닉네임  ');
    fireEvent.press(screen.getByLabelText('닉네임 저장'));

    await waitFor(() => {
      expect(mockUpdateViewer).toHaveBeenCalledWith({
        variables: { input: { displayName: '새 닉네임' } },
      });
    });
  });

  it('shows the requested account actions and opens the privacy policy', async () => {
    const screen = render(<SettingsScreen />);
    await waitFor(() => {
      expect(screen.getByText('shopper@example.com')).toBeOnTheScreen();
    });

    expect(screen.getByLabelText('로그아웃')).toBeOnTheScreen();
    expect(screen.getByLabelText('회원 탈퇴')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('개인정보 처리방침'));

    expect(mockOpenUrl).toHaveBeenCalledWith('https://example.com/privacy');
  });

  it('reports account deletion and logout failures', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('Network request failed'));
    mockLogout.mockRejectedValueOnce(new Error('SecureStore failed'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByText('shopper@example.com')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('회원 탈퇴'));
    const confirmation = alertSpy.mock.calls.find(
      ([title]) => title === '회원 탈퇴를 진행할까요?',
    );
    const actions = confirmation?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    actions?.find(({ text }) => text === '회원 탈퇴')?.onPress?.();
    fireEvent.press(screen.getByLabelText('로그아웃'));

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith(
        '삭제 실패',
        '연결을 확인하고 다시 시도해 주세요.',
      );
      expect(alertSpy).toHaveBeenCalledWith('로그아웃 실패', '다시 시도해 주세요.');
    });
  });
});

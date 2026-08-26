import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from 'react-native';

import { kakaoAccountEmail, type SessionStatus } from '@/features/auth';
import { useProfile } from '@/features/profile';

import { SettingsScreen } from './settings-screen';

const mockLogout = jest.fn();
const mockOpenUrl = jest.spyOn(Linking, 'openURL');
let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockSaveNickname: (() => void) | undefined;
const mockProfile = {
  deleteAccount: jest.fn(),
  displayName: '기존 닉네임',
  updateDisplayName: jest.fn(),
  updating: false,
};

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
  router: { replace: jest.fn() },
}));

jest.mock('@/features/auth', () => ({
  kakaoAccountEmail: jest.fn(),
  useSession: () => ({ logout: mockLogout, status: mockStatus }),
}));

jest.mock('@/features/profile', () => ({ useProfile: jest.fn() }));

jest.mock('@/providers/network-provider', () => ({ useOnline: () => mockOnline }));

jest.mock('@/shared/config/environment', () => ({
  environment: { privacyPolicyUrl: 'https://example.com/privacy' },
}));

jest.mock('@shopport/ui', () => ({
  Screen: ({ children, testID }: { children: ReactNode; testID?: string }) =>
    mockCreateElement(mockView, { testID }, children),
  SectionTitle: ({ children }: { children: ReactNode }) =>
    mockCreateElement(mockText, null, children),
}));

jest.mock('@/shared/ui/glass-button', () => ({
  GlassActionButton: (props: {
    children: ReactNode;
    disabled?: boolean;
    onPress: () => void;
  }) => {
    const { children, disabled, onPress } = props;
    if (children === '닉네임 저장') mockSaveNickname = onPress;
    return mockCreateElement(
      mockPressable,
      {
        accessibilityLabel: typeof children === 'string' ? children : undefined,
        disabled,
        onPress,
      },
      mockCreateElement(mockText, null, children),
    );
  },
}));

const mockedUseProfile = useProfile as jest.MockedFunction<typeof useProfile>;
const mockedKakaoAccountEmail = kakaoAccountEmail as jest.MockedFunction<
  typeof kakaoAccountEmail
>;

describe('settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
    mockSaveNickname = undefined;
    mockProfile.displayName = '기존 닉네임';
    mockProfile.updating = false;
    mockedUseProfile.mockReturnValue(mockProfile);
    mockedKakaoAccountEmail.mockResolvedValue('shopper@example.com');
    mockProfile.updateDisplayName.mockResolvedValue(null);
    mockOpenUrl.mockResolvedValue(true);
    mockLogout.mockResolvedValue(undefined);
    mockProfile.deleteAccount.mockResolvedValue(null);
  });

  it('does not mount private profile hooks or content while booting', () => {
    mockStatus = 'booting';

    const screen = render(<SettingsScreen />);

    expect(screen.queryByTestId('settings-screen')).toBeNull();
    expect(mockedUseProfile).not.toHaveBeenCalled();
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
  });

  it('redirects guests before private profile hooks mount', () => {
    mockStatus = 'guest';

    const screen = render(<SettingsScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseProfile).not.toHaveBeenCalled();
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
  });

  it('renders the cached profile name and disables remote updates while offline-authenticated', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;
    mockProfile.displayName = '캐시된 닉네임';

    const screen = render(<SettingsScreen />);

    expect(screen.getByLabelText('닉네임')).toHaveProp('value', '캐시된 닉네임');
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('닉네임'), '오프라인 변경');
    expect(screen.getByLabelText('닉네임 저장')).toBeDisabled();
  });

  it('uses the profile feature and loads Kakao email for online authenticated sessions', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(mockedKakaoAccountEmail).toHaveBeenCalledTimes(1));
    expect(mockedUseProfile).toHaveBeenCalled();
  });

  it('updates the nickname and displays the Kakao account email', async () => {
    const screen = render(<SettingsScreen />);
    await waitFor(() => {
      expect(screen.getByText('shopper@example.com')).toBeOnTheScreen();
    });

    fireEvent.changeText(screen.getByLabelText('닉네임'), '  새 닉네임  ');
    fireEvent.press(screen.getByLabelText('닉네임 저장'));

    await waitFor(() => {
      expect(mockProfile.updateDisplayName).toHaveBeenCalledWith('새 닉네임');
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
    mockProfile.deleteAccount.mockResolvedValueOnce(
      '연결을 확인하고 다시 시도해 주세요.',
    );
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

  it('logs out and returns to auth after successful account deletion', async () => {
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

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(router.replace).toHaveBeenCalledWith('/auth');
    });
  });

  it('blocks a retained delete confirmation after the session becomes offline', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<SettingsScreen />);
    await waitFor(() => expect(mockedKakaoAccountEmail).toHaveBeenCalledTimes(1));

    fireEvent.press(screen.getByLabelText('회원 탈퇴'));
    const confirmation = alertSpy.mock.calls.find(
      ([title]) => title === '회원 탈퇴를 진행할까요?',
    );
    const actions = confirmation?.[2] as
      | Array<{ text?: string; onPress?: () => void }>
      | undefined;
    mockStatus = 'offline-authenticated';
    screen.rerender(<SettingsScreen />);
    actions?.find(({ text }) => text === '회원 탈퇴')?.onPress?.();

    await act(async () => Promise.resolve());
    expect(mockProfile.deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('checks current remote permission again before saving a nickname', async () => {
    const screen = render(<SettingsScreen />);
    await waitFor(() => expect(mockedKakaoAccountEmail).toHaveBeenCalledTimes(1));
    fireEvent.changeText(screen.getByLabelText('닉네임'), '새 닉네임');
    const save = mockSaveNickname;

    mockStatus = 'offline-authenticated';
    screen.rerender(<SettingsScreen />);
    save?.();

    await act(async () => Promise.resolve());
    expect(mockProfile.updateDisplayName).toHaveBeenCalledTimes(1);
  });
});

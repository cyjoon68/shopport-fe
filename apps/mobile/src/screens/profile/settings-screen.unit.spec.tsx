import { useMutation, useQuery } from '@apollo/client/react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import {
  Alert,
  Linking,
  Pressable as mockPressable,
  Text as mockText,
  View as mockView,
} from 'react-native';

import { kakaoAccountEmail, type SessionStatus } from '@/features/auth';

import { SettingsScreen } from './settings-screen';

const mockLogout = jest.fn();
const mockUpdateViewer = jest.fn();
const mockDeleteAccount = jest.fn();
const mockOpenUrl = jest.spyOn(Linking, 'openURL');
let mockMutationCall = 0;
let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockSaveNickname: (() => void) | undefined;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
  router: { replace: jest.fn() },
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock('@/features/auth', () => ({
  kakaoAccountEmail: jest.fn(),
  useSession: () => ({ logout: mockLogout, status: mockStatus }),
}));

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

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedKakaoAccountEmail = kakaoAccountEmail as jest.MockedFunction<
  typeof kakaoAccountEmail
>;

describe('settings screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
    mockSaveNickname = undefined;
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

  it('does not mount private profile hooks or content while booting', () => {
    mockStatus = 'booting';

    const screen = render(<SettingsScreen />);

    expect(screen.queryByTestId('settings-screen')).toBeNull();
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedUseMutation).not.toHaveBeenCalled();
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
  });

  it('redirects guests before private profile hooks mount', () => {
    mockStatus = 'guest';

    const screen = render(<SettingsScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedUseMutation).not.toHaveBeenCalled();
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
  });

  it('uses Apollo cache only and disables remote updates while offline-authenticated', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;

    const screen = render(<SettingsScreen />);

    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fetchPolicy: 'cache-only', skip: false }),
    );
    expect(mockedKakaoAccountEmail).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByLabelText('닉네임'), '오프라인 변경');
    expect(screen.getByLabelText('닉네임 저장')).toBeDisabled();
  });

  it('enables remote profile reads for online authenticated sessions', async () => {
    render(<SettingsScreen />);

    await waitFor(() => expect(mockedKakaoAccountEmail).toHaveBeenCalledTimes(1));
    expect(mockedUseQuery).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fetchPolicy: 'cache-and-network', skip: false }),
    );
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
    expect(mockDeleteAccount).not.toHaveBeenCalled();
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
    expect(mockUpdateViewer).not.toHaveBeenCalled();
  });
});

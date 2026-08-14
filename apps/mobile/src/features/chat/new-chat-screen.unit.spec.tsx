import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useMutation } from '@apollo/client/react';
import { NewChatScreen } from './new-chat-screen';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: mockPush },
}));

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

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(() => Promise.resolve()),
}));

const mockedUseMutation = useMutation as jest.MockedFunction<typeof useMutation>;

describe('new chat screen', () => {
  it('shows a recoverable error when conversation creation rejects', async () => {
    const createConversation = jest.fn().mockRejectedValue(new Error('서버 오류'));
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(<NewChatScreen />);

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '가벼운 텀블러');
    await act(async () => {
      fireEvent.press(screen.getByText('보내기'));
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('대화를 만들지 못했습니다', '서버 오류');
    expect(mockPush).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

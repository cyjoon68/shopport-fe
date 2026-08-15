import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { useMutation } from '@apollo/client/react';
import { NewChatScreen } from './new-chat-screen';

const mockPush = jest.fn();
const mockOpenDrawer = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: (...args: Array<unknown>) => mockPush(...args) },
  useNavigation: () => ({ openDrawer: mockOpenDrawer }),
}));

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: () => true,
}));

jest.mock('./chat-segmented-control', () => ({
  ChatSegmentedControl: 'ChatSegmentedControl',
}));

jest.mock('@/features/catalog/found-products-screen', () => {
  const React = require('react');
  return {
    FoundProductsContent: () =>
      React.createElement('Text', { testID: 'found-products-content' }, '상품'),
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

describe('new chat screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the drawer from the top-left menu button', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<NewChatScreen />);

    fireEvent.press(screen.getByLabelText('메뉴 열기'));

    expect(mockOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it('opens saved products from the top-right button', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<NewChatScreen />);

    fireEvent.press(screen.getByLabelText('저장한 상품 보기'));

    expect(mockPush).toHaveBeenCalledWith('/favorites');
  });

  it('shows image and send controls in the composer', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<NewChatScreen />);

    expect(screen.getByLabelText('이미지 첨부')).toBeOnTheScreen();
    expect(screen.getByLabelText('메시지 보내기')).toBeOnTheScreen();
  });

  it('switches to found products', () => {
    const createConversation = jest.fn();
    mockedUseMutation.mockReturnValue([
      createConversation,
      { called: false, client: {}, loading: false, reset: jest.fn() },
    ] as ReturnType<typeof useMutation>);
    const screen = render(<NewChatScreen />);

    fireEvent(screen.getByTestId('new-chat-segmented-control'), 'valueChange', '상품');

    expect(screen.getByTestId('found-products-content')).toBeOnTheScreen();
  });

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
      fireEvent.press(screen.getByLabelText('메시지 보내기'));
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('대화를 만들지 못했습니다', '서버 오류');
    expect(mockPush).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

import { fireEvent, render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { Pressable as mockPressable } from 'react-native';
import { ChatNewConversation } from './chat-new-conversation';

jest.mock('@/shared/ui/glass-button', () => ({
  GlassButton: ({
    accessibilityLabel,
    children,
    disabled,
    onPress,
  }: {
    accessibilityLabel?: string;
    children: ReactNode;
    disabled?: boolean;
    onPress: () => void;
  }) =>
    mockCreateElement(mockPressable, { accessibilityLabel, disabled, onPress }, children),
}));

describe('new conversation composer', () => {
  it('keeps the NewChat footer affordances', () => {
    const onCreate = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatNewConversation loading={false} onCreate={onCreate} online />,
    );

    expect(screen.getByLabelText('이미지 첨부')).toBeOnTheScreen();
    expect(screen.getByLabelText('메시지 보내기')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('Shopport에게 추천받기')).toBeOnTheScreen();

    fireEvent.changeText(
      screen.getByPlaceholderText('Shopport에게 추천받기'),
      '가벼운 텀블러',
    );
    fireEvent.press(screen.getByLabelText('메시지 보내기'));

    expect(onCreate).toHaveBeenCalledWith('가벼운 텀블러', false);
  });
});

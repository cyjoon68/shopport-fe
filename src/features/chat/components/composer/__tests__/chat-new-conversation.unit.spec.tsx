import { fireEvent, render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode, useState } from 'react';
import { Pressable as mockPressable } from 'react-native';

import { retailerIds } from '../../../constants';
import type { RetailerId } from '../../../types';
import { ChatNewConversation } from '../chat-new-conversation';

jest.mock('@/shared/components', () => ({
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
  glassButtonIconSize: 16,
  PlatformIcon: () => null,
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

  it('hides quick actions while text is present and restores them when cleared', () => {
    const onCreate = jest.fn(() => Promise.resolve());
    const Composer = () => {
      const [providerIds, setProviderIds] = useState<ReadonlyArray<RetailerId>>([]);
      const toggleProvider = (providerId: RetailerId): void => {
        setProviderIds((current) =>
          current.includes(providerId)
            ? current.filter((id) => id !== providerId)
            : retailerIds.filter((id) => current.includes(id) || id === providerId),
        );
      };
      return (
        <ChatNewConversation
          loading={false}
          onCreate={onCreate}
          onProviderToggle={toggleProvider}
          online
          providerIds={providerIds}
        />
      );
    };
    const screen = render(<Composer />);
    const input = screen.getByPlaceholderText('Shopport에게 추천받기');

    expect(screen.getByTestId('chat-quick-actions')).toBeOnTheScreen();
    fireEvent.changeText(input, '립밤 추천해줘');
    expect(screen.queryByTestId('chat-quick-actions')).toBeNull();
    fireEvent.changeText(input, '');
    expect(screen.getByTestId('chat-quick-actions')).toBeOnTheScreen();
  });
});

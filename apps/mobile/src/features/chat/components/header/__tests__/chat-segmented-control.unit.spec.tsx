import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { View as mockNativeView } from 'react-native';

jest.mock('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => {
      const gesture = {
        activateAfterLongPress: () => gesture,
        onBegin: () => gesture,
        onEnd: () => gesture,
        onFinalize: () => gesture,
        onUpdate: () => gesture,
      };
      return gesture;
    },
  },
  GestureDetector: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('react-native-reanimated', () => {
  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View: mockNativeView },
    runOnJS: (callback: (...args: Array<unknown>) => unknown) => callback,
    useAnimatedStyle: (updater: () => object) => updater(),
    useSharedValue: (value: number) => {
      let current = value;
      return {
        get: () => current,
        set: (next: number) => {
          current = next;
        },
      };
    },
    withTiming: (value: number) => value,
  };
});

import { ChatSegmentedControl } from '../chat-segmented-control';

describe('chat segmented control', () => {
  it('changes the selected tab from a press', () => {
    const onValueChange = jest.fn();
    const screen = render(
      <ChatSegmentedControl onValueChange={onValueChange} value="채팅" />,
    );

    fireEvent.press(screen.getByLabelText('상품'));

    expect(onValueChange).toHaveBeenCalledWith('상품');
  });

  it('announces an unread state for a tab', () => {
    const screen = render(
      <ChatSegmentedControl
        onValueChange={jest.fn()}
        unread={{ 채팅: false, 상품: true }}
        value="채팅"
      />,
    );

    expect(screen.getByLabelText('상품 읽지 않음')).toBeOnTheScreen();
  });
});

import { fireEvent, render } from '@testing-library/react-native';
import type { ReactNode } from 'react';

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
  const { View } = jest.requireActual('react-native');

  return {
    __esModule: true,
    cancelAnimation: jest.fn(),
    default: { View },
    runOnJS: (callback: (...args: Array<unknown>) => unknown) => callback,
    useAnimatedStyle: (updater: () => object) => updater(),
    useSharedValue: (value: number) => ({ value }),
    withTiming: (value: number) => value,
  };
});

import { ChatSegmentedControl } from './chat-segmented-control';

describe('chat segmented control', () => {
  it('changes the selected tab from a press', () => {
    const onValueChange = jest.fn();
    const screen = render(
      <ChatSegmentedControl onValueChange={onValueChange} value="채팅" />,
    );

    fireEvent.press(screen.getByLabelText('상품'));

    expect(onValueChange).toHaveBeenCalledWith('상품');
  });
});

import { useEffect, useRef } from 'react';
import { Animated, Keyboard, Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

export const useKeyboardLift = (): Animated.Value => {
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const insetBottom = initialWindowMetrics?.insets.bottom ?? 0;
  useEffect(() => {
    const liftTo = (next: number): void => {
      keyboardLift.setValue(next);
    };
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => {
        liftTo(Math.max(0, event.endCoordinates.height - insetBottom));
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => liftTo(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insetBottom, keyboardLift]);
  return keyboardLift;
};

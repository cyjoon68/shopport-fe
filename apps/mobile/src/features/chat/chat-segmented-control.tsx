import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

const tabs = ['채팅', '상품'] as const;
const animationDuration = 220;
const activePillWidth = 100;
const longPressDelay = 150;

export type ChatTab = (typeof tabs)[number];

type ChatSegmentedControlProps = Readonly<{
  onValueChange: (value: ChatTab) => void;
  testID?: string | undefined;
  value: ChatTab;
}>;

const getActivePillOffset = (value: ChatTab): number =>
  value === '상품' ? activePillWidth : 0;

export const ChatSegmentedControl = ({
  onValueChange,
  testID,
  value,
}: ChatSegmentedControlProps) => {
  const activePillOffset = useSharedValue(getActivePillOffset(value));
  const dragStartOffset = useSharedValue(activePillOffset.value);

  useEffect(() => {
    activePillOffset.value = withTiming(getActivePillOffset(value), {
      duration: animationDuration,
    });
  }, [activePillOffset, value]);

  const activePillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activePillOffset.value }],
  }));

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(longPressDelay)
    .onBegin(() => {
      cancelAnimation(activePillOffset);
      dragStartOffset.value = activePillOffset.value;
    })
    .onUpdate((event) => {
      activePillOffset.value = Math.max(
        0,
        Math.min(activePillWidth, dragStartOffset.value + event.translationX),
      );
    })
    .onEnd(() => {
      const nextValue = activePillOffset.value >= activePillWidth / 2 ? '상품' : '채팅';
      activePillOffset.value = withTiming(nextValue === '상품' ? activePillWidth : 0, {
        duration: animationDuration,
      });
      runOnJS(onValueChange)(nextValue);
    })
    .onFinalize((_, success) => {
      if (success) return;
      activePillOffset.value = withTiming(value === '상품' ? activePillWidth : 0, {
        duration: animationDuration,
      });
    });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={styles.control} testID={testID}>
        <Animated.View
          pointerEvents="none"
          style={[styles.activePill, activePillStyle]}
        />
        {tabs.map((tab) => {
          const selected = tab === value;

          return (
            <Pressable
              accessibilityLabel={tab}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab}
              onPress={() => onValueChange(tab)}
              style={styles.tab}
              testID={`new-chat-segment-${tab}`}
            >
              <Text
                allowFontScaling={false}
                style={selected ? styles.activeText : styles.text}
              >
                {tab}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create((theme) => ({
  activePill: {
    backgroundColor: theme.colors.surfaceMuted,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    bottom: 3,
    left: 3,
    position: 'absolute',
    top: 3,
    width: activePillWidth,
  },
  activeText: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  control: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    height: 44,
    overflow: 'hidden',
    padding: 3,
    position: 'relative',
    width: 208,
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
}));

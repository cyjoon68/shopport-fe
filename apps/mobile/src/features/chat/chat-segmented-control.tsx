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
  unread?: Readonly<Record<ChatTab, boolean>>;
  testID?: string | undefined;
  value: ChatTab;
}>;

const getActivePillOffset = (value: ChatTab): number =>
  value === '상품' ? activePillWidth : 0;

export const ChatSegmentedControl = ({
  onValueChange,
  unread,
  testID,
  value,
}: ChatSegmentedControlProps) => {
  const initialPillOffset = getActivePillOffset(value);
  const activePillOffset = useSharedValue(initialPillOffset);
  const dragStartOffset = useSharedValue(initialPillOffset);

  useEffect(() => {
    activePillOffset.set(
      withTiming(getActivePillOffset(value), { duration: animationDuration }),
    );
  }, [activePillOffset, value]);

  const activePillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: activePillOffset.get() }],
  }));

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(longPressDelay)
    .onBegin(() => {
      cancelAnimation(activePillOffset);
      dragStartOffset.set(activePillOffset.get());
    })
    .onUpdate((event) => {
      activePillOffset.set(
        Math.max(
          0,
          Math.min(activePillWidth, dragStartOffset.get() + event.translationX),
        ),
      );
    })
    .onEnd(() => {
      const nextValue = activePillOffset.get() >= activePillWidth / 2 ? '상품' : '채팅';
      activePillOffset.set(
        withTiming(nextValue === '상품' ? activePillWidth : 0, {
          duration: animationDuration,
        }),
      );
      runOnJS(onValueChange)(nextValue);
    })
    .onFinalize((_, success) => {
      if (success) return;
      activePillOffset.set(
        withTiming(value === '상품' ? activePillWidth : 0, {
          duration: animationDuration,
        }),
      );
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
              accessibilityHint={unread?.[tab] ? `${tab} 읽지 않음` : undefined}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              key={tab}
              onPress={() => onValueChange(tab)}
              style={styles.tab}
              testID={`new-chat-segment-${tab}`}
            >
              <View style={styles.tabContent}>
                <Text
                  allowFontScaling={false}
                  style={selected ? styles.activeText : styles.text}
                >
                  {tab}
                </Text>
                {unread?.[tab] ? (
                  <View
                    accessibilityLabel={`${tab} 읽지 않음`}
                    style={styles.unreadDot}
                  />
                ) : null}
              </View>
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
  tabContent: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  unreadDot: {
    backgroundColor: theme.colors.danger,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  text: {
    color: theme.colors.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
}));

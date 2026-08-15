import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  Text,
  type AccessibilityState,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useReducedTransparency } from '@/shared/accessibility/use-reduced-transparency';

type GlassButtonProps = Readonly<{
  accessibilityHint?: string | undefined;
  accessibilityLabel?: string | undefined;
  accessibilityState?: AccessibilityState | undefined;
  children: ReactNode;
  disabled?: boolean | undefined;
  fallbackStyle?: StyleProp<ViewStyle> | undefined;
  hitSlop?: number | undefined;
  onPress: () => void;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
  tintColor?: string | undefined;
}>;

type GlassActionButtonProps = Readonly<{
  accessibilityHint?: string | undefined;
  children: ReactNode;
  disabled?: boolean | undefined;
  loading?: boolean | undefined;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'kakao' | undefined;
}>;

export const glassButtonIconSize = 16;

export const GlassButton = ({
  accessibilityHint,
  accessibilityLabel,
  accessibilityState,
  children,
  disabled = false,
  fallbackStyle,
  hitSlop,
  onPress,
  style,
  testID,
  tintColor,
}: GlassButtonProps) => {
  const reducedTransparency = useReducedTransparency();
  const glassAvailable =
    Platform.OS === 'ios' && !reducedTransparency && isGlassEffectAPIAvailable();
  const state = { ...accessibilityState, disabled };
  const glassTint = tintColor === undefined ? {} : { tintColor };

  if (glassAvailable) {
    return (
      <Pressable
        accessibilityHint={accessibilityHint}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        accessibilityState={state}
        disabled={disabled}
        hitSlop={hitSlop}
        onPress={onPress}
        testID={testID}
      >
        <GlassView
          glassEffectStyle="regular"
          isInteractive={!disabled}
          style={[styles.glass, style]}
          {...glassTint}
        >
          {children}
        </GlassView>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={state}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      style={({ pressed }) => [
        styles.fallback,
        style,
        fallbackStyle,
        pressed && !disabled && styles.pressed,
      ]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
};

export const GlassActionButton = ({
  accessibilityHint,
  children,
  disabled = false,
  loading = false,
  onPress,
  variant = 'primary',
}: GlassActionButtonProps) => {
  const { theme } = useUnistyles();
  const unavailable = disabled || loading;
  const fallbackStyle =
    variant === 'secondary'
      ? styles.secondaryFallback
      : variant === 'danger'
        ? styles.dangerFallback
        : variant === 'kakao'
          ? styles.kakaoFallback
          : styles.primaryFallback;
  const labelStyle = variant === 'danger' ? styles.dangerLabel : styles.actionLabel;

  return (
    <GlassButton
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading }}
      disabled={unavailable}
      fallbackStyle={fallbackStyle}
      onPress={onPress}
      style={styles.action}
      tintColor={unavailable ? theme.colors.surfaceMuted : undefined}
    >
      {loading ? (
        <ActivityIndicator color={theme.colors.text} />
      ) : (
        <Text allowFontScaling maxFontSizeMultiplier={2} style={labelStyle}>
          {children}
        </Text>
      )}
    </GlassButton>
  );
};

const styles = StyleSheet.create((theme) => ({
  glass: { borderCurve: 'continuous', borderRadius: theme.radii.md },
  fallback: { borderCurve: 'continuous', borderRadius: theme.radii.md },
  pressed: { opacity: 0.72 },
  action: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  primaryFallback: { backgroundColor: theme.colors.primary },
  kakaoFallback: { backgroundColor: '#FEE500' },
  secondaryFallback: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  dangerFallback: { backgroundColor: theme.colors.danger },
  actionLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
  dangerLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '600' },
}));

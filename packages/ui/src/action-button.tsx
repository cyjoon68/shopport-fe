import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type ActionButtonProps = Readonly<{
  accessibilityHint?: string;
  children: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'kakao';
}>;

export const ActionButton = ({
  accessibilityHint,
  children,
  disabled = false,
  loading = false,
  onPress,
  variant = 'primary',
}: ActionButtonProps) => {
  styles.useVariants({ variant, disabled: disabled || loading });
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [styles.root, pressed && styles.pressed]}
    >
      {loading ? (
        <ActivityIndicator color={styles.indicator.color} />
      ) : (
        <Text allowFontScaling maxFontSizeMultiplier={2} style={styles.label}>
          {children}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'center',
    borderRadius: theme.radii.md,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 12,
    variants: {
      variant: {
        primary: { backgroundColor: theme.colors.primary },
        kakao: { backgroundColor: '#FEE500' },
        secondary: {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderWidth: 1,
        },
        danger: { backgroundColor: theme.colors.danger },
      },
      disabled: {
        true: { opacity: 0.45 },
        false: { opacity: 1 },
      },
    },
    compoundVariants: [
      {
        variant: 'secondary',
        styles: { backgroundColor: theme.colors.surface },
      },
    ],
  },
  pressed: { opacity: 0.72 },
  label: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '600',
    variants: {
      variant: {
        primary: { color: theme.colors.primaryText },
        kakao: { color: '#191919' },
        secondary: { color: theme.colors.text },
        danger: { color: '#FFFFFF' },
      },
    },
  },
  indicator: {
    color: theme.colors.primaryText,
    variants: {
      variant: {
        kakao: { color: '#191919' },
      },
    },
  },
}));

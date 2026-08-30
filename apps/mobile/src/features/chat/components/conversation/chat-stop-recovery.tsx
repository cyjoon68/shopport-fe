import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ChatRecovery } from '../../types';

export const ChatStopRecovery = ({
  message,
  onEdit,
  onRetry,
  retrying,
}: ChatRecovery) => (
  <View accessibilityLiveRegion="polite" style={styles.root}>
    <Text allowFontScaling style={styles.message}>
      {message}
    </Text>
    <View style={styles.actions}>
      <Pressable
        accessibilityLabel="질문 수정"
        accessibilityRole="button"
        disabled={retrying}
        onPress={onEdit}
        style={styles.action}
      >
        <Text allowFontScaling style={styles.actionLabel}>
          질문 수정
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="다시 검색"
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying }}
        disabled={retrying}
        onPress={onRetry}
        style={styles.action}
      >
        <Text allowFontScaling style={styles.actionLabel}>
          다시 검색
        </Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'flex-start',
    backgroundColor: theme.colors.surfaceMuted,
    borderCurve: 'continuous',
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.md,
  },
  message: { color: theme.colors.text, fontSize: 15, lineHeight: 22 },
  actions: { flexDirection: 'row', gap: theme.spacing.sm },
  action: {
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
  },
  actionLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '600' },
}));

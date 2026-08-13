import type { ReactNode } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type EmptyStateProps = Readonly<{
  action?: ReactNode;
  description: string;
  title: string;
}>;

export const EmptyState = ({ action, description, title }: EmptyStateProps) => (
  <View accessibilityRole="summary" style={styles.root}>
    <Text allowFontScaling style={styles.title}>
      {title}
    </Text>
    <Text allowFontScaling style={styles.description}>
      {description}
    </Text>
    {action}
  </View>
);

const styles = StyleSheet.create((theme) => ({
  root: {
    alignItems: 'center',
    gap: 12,
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  description: {
    color: theme.colors.textMuted,
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
  },
}));

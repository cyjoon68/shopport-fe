import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    fontSize: 13,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
  draftStatus: {
    color: theme.colors.textMuted,
    fontSize: 13,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
  attachment: {
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    flexDirection: 'row',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  thumbnail: { borderRadius: theme.radii.md, height: 64, width: 64 },
  removeButton: { minHeight: 44, justifyContent: 'center' },
  removeLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
  assetStatus: { flex: 1, gap: theme.spacing.xs },
  statusLabel: { color: theme.colors.textMuted, fontSize: 13 },
  retryButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryLabel: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
}));

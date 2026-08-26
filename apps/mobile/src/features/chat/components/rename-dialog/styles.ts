import { StyleSheet } from 'react-native-unistyles';

export const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, justifyContent: 'center', padding: theme.spacing.xl },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.scrim,
  },
  dialog: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.lg,
    padding: theme.spacing.lg,
  },
  title: {
    color: theme.colors.text,
    fontWeight: '700',
    ...theme.typography.conversation.sheetTitle,
  },
  field: { gap: theme.spacing.sm },
  label: {
    color: theme.colors.text,
    fontWeight: '600',
    ...theme.typography.conversation.sheetAction,
  },
  input: {
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.md,
    borderWidth: 1,
    color: theme.colors.text,
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
    ...theme.typography.conversation.body,
  },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, justifyContent: 'flex-end' },
  action: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    minWidth: 72,
    paddingHorizontal: theme.spacing.lg,
  },
  cancel: { borderColor: theme.colors.border, borderWidth: 1 },
  submit: { backgroundColor: theme.colors.primary },
  disabled: { opacity: 0.45 },
  cancelLabel: { color: theme.colors.text, ...theme.typography.conversation.sheetAction },
  submitLabel: {
    color: theme.colors.primaryText,
    fontWeight: '700',
    ...theme.typography.conversation.sheetAction,
  },
}));

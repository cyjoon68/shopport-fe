import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { AskUserRequest } from './types';

type AskUserCardProps = Readonly<{
  disabled?: boolean;
  disabledMessage?: string | undefined;
  onSelect: (label: string) => Promise<void>;
  request: AskUserRequest;
}>;

export const AskUserCard = ({
  disabled = false,
  disabledMessage,
  onSelect,
  request,
}: AskUserCardProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const select = async (id: string, label: string): Promise<void> => {
    if (disabled || selectedId) return;
    setFailed(false);
    setSelectedId(id);
    try {
      await onSelect(label);
    } catch {
      setSelectedId(null);
      setFailed(true);
    }
  };
  return (
    <View accessibilityLabel="Shopport의 추가 질문" style={styles.root}>
      <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.question}>
        {request.question}
      </Text>
      <View style={styles.options}>
        {request.options.map((option) => {
          const optionDisabled = disabled || selectedId !== null;
          const selected = selectedId === option.id;
          return (
            <Pressable
              accessibilityLabel={option.label}
              accessibilityRole="button"
              accessibilityState={{ disabled: optionDisabled, selected }}
              disabled={optionDisabled}
              key={option.id}
              onPress={() => void select(option.id, option.label)}
              style={({ pressed }) => [
                styles.option,
                styles.optionSurface,
                optionDisabled && !selected && styles.disabledOption,
                selected && styles.selectedOption,
                pressed && !optionDisabled && styles.pressedOption,
              ]}
            >
              <Text
                allowFontScaling
                maxFontSizeMultiplier={3}
                style={[
                  styles.optionLabel,
                  optionDisabled && !selected && styles.disabledOptionLabel,
                  selected && styles.selectedOptionLabel,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.hint}>
        {selectedId
          ? '답변을 보내는 중이에요'
          : (disabledMessage ??
            (disabled ? '답변을 보내는 중이에요' : '선택지에서 답해 주세요'))}
      </Text>
      {failed ? (
        <Text
          accessibilityLiveRegion="polite"
          allowFontScaling
          maxFontSizeMultiplier={3}
          style={styles.error}
        >
          답을 보내지 못했어요. 다시 눌러 주세요.
        </Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: {
    backgroundColor: theme.colors.surface,
    borderCurve: 'continuous',
    borderRadius: theme.radii.lg,
    gap: theme.spacing.md,
    padding: theme.spacing.lg,
    width: '100%',
  },
  question: {
    color: theme.colors.text,
    ...theme.typography.conversation.body,
    fontWeight: '600',
  },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm },
  option: {
    borderCurve: 'continuous',
    borderRadius: theme.radii.md,
    flexShrink: 1,
    justifyContent: 'center',
    maxWidth: '100%',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  optionSurface: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  disabledOption: { backgroundColor: theme.colors.surfaceMuted },
  selectedOption: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
    borderWidth: 1,
  },
  pressedOption: { opacity: 0.72 },
  optionLabel: { color: theme.colors.text, ...theme.typography.conversation.body },
  disabledOptionLabel: { color: theme.colors.textMuted },
  selectedOptionLabel: { color: theme.colors.primaryText, fontWeight: '600' },
  hint: { color: theme.colors.textMuted, ...theme.typography.conversation.hint },
  error: { color: theme.colors.danger, ...theme.typography.conversation.hint },
}));

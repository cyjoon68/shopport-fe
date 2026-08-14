import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { AskUserRequest } from './types';

type AskUserCardProps = Readonly<{
  disabled?: boolean;
  onSelect: (label: string) => Promise<void>;
  request: AskUserRequest;
}>;

export const AskUserCard = ({
  disabled = false,
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
              accessibilityRole="button"
              accessibilityState={{ disabled: optionDisabled, selected }}
              disabled={optionDisabled}
              key={option.id}
              onPress={() => void select(option.id, option.label)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.selected,
                optionDisabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.optionLabel}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.hint}>
        {request.allowFreeText ? '직접 답해도 좋아요' : '선택지에서 답해 주세요'}
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
    borderColor: theme.colors.border,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxWidth: '94%',
    padding: theme.spacing.lg,
  },
  question: { color: theme.colors.text, fontSize: 16, lineHeight: 24 },
  options: { gap: theme.spacing.sm },
  option: {
    borderColor: theme.colors.border,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  selected: {
    backgroundColor: theme.colors.surfaceMuted,
    borderColor: theme.colors.text,
  },
  disabled: { opacity: 0.6 },
  optionLabel: { color: theme.colors.text, fontSize: 16, lineHeight: 24 },
  hint: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  error: { color: theme.colors.danger, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.5 },
}));

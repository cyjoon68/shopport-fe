import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { AskUserRequest } from './ask-user';

type AskUserCardProps = Readonly<{
  onSelect: (label: string) => Promise<void>;
  request: AskUserRequest;
}>;

export const AskUserCard = ({ onSelect, request }: AskUserCardProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const select = async (id: string, label: string): Promise<void> => {
    if (selectedId) return;
    setSelectedId(id);
    await onSelect(label);
  };
  return (
    <View accessibilityLabel="Shopport의 추가 질문" style={styles.root}>
      <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.question}>
        {request.question}
      </Text>
      <View style={styles.options}>
        {request.options.map((option) => {
          const disabled = selectedId !== null;
          const selected = selectedId === option.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled, selected }}
              disabled={disabled}
              key={option.id}
              onPress={() => void select(option.id, option.label)}
              style={({ pressed }) => [
                styles.option,
                selected && styles.selected,
                pressed && styles.pressed,
              ]}
            >
              <Text
                allowFontScaling
                maxFontSizeMultiplier={3}
                style={styles.optionLabel}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {request.allowFreeText ? (
        <Text allowFontScaling maxFontSizeMultiplier={3} style={styles.hint}>
          직접 답해도 좋아요
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
  optionLabel: { color: theme.colors.text, fontSize: 16, lineHeight: 24 },
  hint: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21 },
  pressed: { opacity: 0.5 },
}));

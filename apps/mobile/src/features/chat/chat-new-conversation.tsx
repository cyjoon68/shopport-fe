import { useState } from 'react';
import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useReducedTransparency } from '@/shared/accessibility/use-reduced-transparency';
import { GlassButton, glassButtonIconSize } from '@/shared/ui/glass-button';

type ChatNewConversationProps = Readonly<{
  loading: boolean;
  onCreate: (draft: string, withImage: boolean) => Promise<void>;
  online: boolean;
}>;

export const ChatNewConversation = ({
  loading,
  onCreate,
  online,
}: ChatNewConversationProps) => {
  const { theme } = useUnistyles();
  const reducedTransparency = useReducedTransparency();
  const [text, setText] = useState('');
  const glassAvailable =
    Platform.OS === 'ios' && !reducedTransparency && isGlassEffectAPIAvailable();
  const sendDisabled = loading || !online || !text.trim();
  const imageDisabled = loading || !online;
  const content = (
    <>
      <GlassButton
        accessibilityLabel="이미지 첨부"
        disabled={imageDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={() => void onCreate(text.trim(), true)}
        style={styles.composerButton}
      >
        <Image
          contentFit="contain"
          source="sf:photo"
          style={styles.composerSymbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
      <TextInput
        accessibilityLabel="쇼핑 질문"
        editable={!loading}
        enablesReturnKeyAutomatically
        maxLength={2_000}
        onChangeText={setText}
        onSubmitEditing={() => {
          if (!sendDisabled) void onCreate(text.trim(), false);
        }}
        placeholder="Shopport에게 추천받기"
        placeholderTextColor={styles.placeholder.color}
        returnKeyType="send"
        style={styles.input}
        value={text}
      />
      <GlassButton
        accessibilityLabel="메시지 보내기"
        disabled={sendDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={() => void onCreate(text.trim(), false)}
        style={styles.composerButton}
        tintColor={sendDisabled ? theme.colors.surfaceMuted : theme.colors.background}
      >
        <Image
          contentFit="contain"
          source="sf:arrow.up"
          style={styles.composerSymbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.keyboard}
    >
      {glassAvailable ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.glassComposer}>
          {content}
        </GlassView>
      ) : (
        <View style={styles.fallbackComposer}>{content}</View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create((theme) => ({
  keyboard: { flex: 1, justifyContent: 'flex-end' },
  glassComposer: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    flexDirection: 'row',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
  },
  fallbackComposer: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    minHeight: 56,
    paddingHorizontal: theme.spacing.md,
  },
  input: {
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 24,
    minHeight: 48,
    paddingHorizontal: 0,
    paddingVertical: theme.spacing.sm,
    textAlignVertical: 'center',
  },
  composerButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  composerButtonFallback: { backgroundColor: theme.colors.surfaceMuted },
  composerSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
  placeholder: { color: theme.colors.textMuted },
}));

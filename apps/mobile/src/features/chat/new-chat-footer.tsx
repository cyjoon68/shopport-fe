import { KeyboardAvoidingView, Platform, TextInput, View } from 'react-native';
import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useReducedTransparency } from '@/shared/accessibility/use-reduced-transparency';
import { GlassButton, glassButtonIconSize } from '@/shared/ui/glass-button';

type NewChatFooterProps = Readonly<{
  attachDisabled: boolean;
  fill?: boolean;
  inputEditable: boolean;
  loading: boolean;
  onAttach: () => Promise<void>;
  onSend: () => Promise<void>;
  onStop?: () => Promise<void>;
  sendDisabled: boolean;
  setText: (text: string) => void;
  text: string;
}>;

export const NewChatFooter = ({
  attachDisabled,
  fill = false,
  inputEditable,
  loading,
  onAttach,
  onSend,
  onStop,
  sendDisabled,
  setText,
  text,
}: NewChatFooterProps) => {
  const { theme } = useUnistyles();
  const reducedTransparency = useReducedTransparency();
  const showStop = loading && Boolean(onStop);
  const glassAvailable =
    Platform.OS === 'ios' && !reducedTransparency && isGlassEffectAPIAvailable();
  const send = (): void => {
    if (!sendDisabled) void (showStop ? onStop?.() : onSend());
  };
  const content = (
    <>
      <GlassButton
        accessibilityLabel="이미지 첨부"
        disabled={attachDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={() => void onAttach()}
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
        editable={inputEditable}
        enablesReturnKeyAutomatically
        maxLength={2_000}
        onChangeText={setText}
        onSubmitEditing={send}
        placeholder="Shopport에게 추천받기"
        placeholderTextColor={styles.placeholder.color}
        returnKeyType="send"
        style={styles.input}
        value={text}
      />
      <GlassButton
        accessibilityLabel={showStop ? '응답 중지' : '메시지 보내기'}
        disabled={sendDisabled}
        fallbackStyle={styles.composerButtonFallback}
        onPress={send}
        style={styles.composerButton}
        tintColor={sendDisabled ? theme.colors.surfaceMuted : theme.colors.background}
      >
        <Image
          contentFit="contain"
          source={showStop ? 'sf:stop.fill' : 'sf:arrow.up'}
          style={styles.composerSymbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
    </>
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={fill ? styles.keyboard : undefined}
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

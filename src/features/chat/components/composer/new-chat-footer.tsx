import { GlassView, isGlassEffectAPIAvailable } from 'expo-glass-effect';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Platform, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { useReducedTransparency } from '@/shared/accessibility/hooks';
import { GlassButton, glassButtonIconSize } from '@/shared/components';

import { useKeyboardLift } from '../../hooks';
import type { NewChatFooterProps } from '../../types';
import { ChatQuickActions } from './chat-quick-actions';

export const NewChatFooter = ({
  attachDisabled,
  fill = false,
  focusInput,
  inputEditable,
  loading,
  onAttach,
  onProviderToggle,
  onSend,
  onStop,
  providerIds = [],
  quickActionsEnabled = true,
  sendDisabled,
  setText,
  text,
}: NewChatFooterProps) => {
  const { theme } = useUnistyles();
  const reducedTransparency = useReducedTransparency();
  const keyboardPad = useKeyboardLift();
  const inputRef = useRef<TextInput>(null);
  const focusInputRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (focusInput !== undefined && focusInput !== focusInputRef.current)
      inputRef.current?.focus();
    focusInputRef.current = focusInput;
  }, [focusInput]);
  const showStop = loading && Boolean(onStop);
  const glassAvailable =
    Platform.OS === 'ios' && !reducedTransparency && isGlassEffectAPIAvailable();
  const showQuickActions =
    quickActionsEnabled && inputEditable && text.trim().length === 0;
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
        ref={inputRef}
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
    <Animated.View
      style={
        fill
          ? [styles.keyboard, styles.footer, { paddingBottom: keyboardPad }]
          : [styles.footer, { paddingBottom: keyboardPad }]
      }
    >
      {showQuickActions && onProviderToggle ? (
        <ChatQuickActions
          onProviderToggle={onProviderToggle}
          providerIds={providerIds}
          setText={setText}
        />
      ) : null}
      {glassAvailable ? (
        <GlassView glassEffectStyle="regular" isInteractive style={styles.glassComposer}>
          {content}
        </GlassView>
      ) : (
        <View style={styles.fallbackComposer}>{content}</View>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  keyboard: { flex: 1, justifyContent: 'flex-end' },
  footer: { gap: theme.spacing.sm },
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
    height: theme.interaction.minTouchTarget,
    justifyContent: 'center',
    width: theme.interaction.minTouchTarget,
  },
  composerButtonFallback: { backgroundColor: theme.colors.surfaceMuted },
  composerSymbol: { height: glassButtonIconSize, width: glassButtonIconSize },
  placeholder: { color: theme.colors.textMuted },
}));

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { StyleSheet } from 'react-native-unistyles';
import { useOnline } from '@/providers/network-provider';
import { deleteDraft, readDraft, saveDraft } from '@/shared/storage/database';
import { removeUploadedAsset, selectAndUploadAsset } from './asset-upload';
import type { UploadedAsset } from './asset-upload';
import { pollAssetUntilSettled, readAssetStatus } from './asset-status';

type Attachment = UploadedAsset &
  Readonly<{ state: 'checking' | 'processing' | 'ready' | 'timeout' }>;

type ChatComposerProps = Readonly<{
  conversationId: string;
  loading: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  onStop: () => Promise<void>;
}>;

const bestEffortRemoveUploadedAsset = async (id: string): Promise<void> => {
  try {
    await removeUploadedAsset(id);
  } catch {
    return;
  }
};

export const ChatComposer = ({
  conversationId,
  loading,
  onSend,
  onStop,
}: ChatComposerProps) => {
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null);
  const online = useOnline();
  const assetRef = useRef<Attachment | null>(null);
  const verificationRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);
  const conversationVersionRef = useRef(0);
  const draftReadyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);

  const isCurrentConversation = useCallback(
    (
      id: string,
      version: number,
      generation = lifecycleGenerationRef.current,
    ): boolean =>
      mountedRef.current &&
      lifecycleGenerationRef.current === generation &&
      conversationIdRef.current === id &&
      conversationVersionRef.current === version,
    [],
  );

  useEffect(() => {
    mountedRef.current = true;
    lifecycleGenerationRef.current += 1;
    return () => {
      mountedRef.current = false;
      lifecycleGenerationRef.current += 1;
      conversationVersionRef.current += 1;
      conversationIdRef.current = '';
      draftReadyRef.current = null;
      verificationRef.current = null;
      assetRef.current = null;
    };
  }, []);

  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);

  const applyProcessingResult = useCallback(
    (
      id: string,
      result: Awaited<ReturnType<typeof pollAssetUntilSettled>>,
    ): void => {
      if (assetRef.current?.id !== id) return;
      if (result === 'READY') {
        setAsset((current) =>
          current?.id === id ? { ...current, state: 'ready' } : current,
        );
        return;
      }
      if (result === 'REJECTED') {
        setAsset((current) => (current?.id === id ? null : current));
        Alert.alert(
          '이미지 처리 실패',
          '이미지를 처리할 수 없습니다. 다른 이미지를 선택해 주세요.',
        );
        return;
      }
      setAsset((current) =>
        current?.id === id ? { ...current, state: 'timeout' } : current,
      );
    },
    [],
  );

  const verifyAsset = useCallback(
    async (target: Attachment): Promise<void> => {
      const expectedConversationId = conversationId;
      const expectedVersion = conversationVersionRef.current;
      const expectedGeneration = lifecycleGenerationRef.current;
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      )
        return;
      if (verificationRef.current === target.id) return;
      verificationRef.current = target.id;
      setAsset((current) =>
        current?.id === target.id ? { ...current, state: 'checking' } : current,
      );
      try {
        const result = await pollAssetUntilSettled(target.id);
        if (
          isCurrentConversation(
            expectedConversationId,
            expectedVersion,
            expectedGeneration,
          )
        ) {
          applyProcessingResult(target.id, result);
        }
      } catch (error) {
        if (
          isCurrentConversation(
            expectedConversationId,
            expectedVersion,
            expectedGeneration,
          )
        ) {
          setAsset((current) =>
            current?.id === target.id
              ? { ...current, state: 'timeout' }
              : current,
          );
          Alert.alert(
            '이미지 상태 확인 실패',
            error instanceof Error
              ? error.message
              : '연결을 확인하고 다시 시도해 주세요.',
          );
        }
      } finally {
        if (
          isCurrentConversation(
            expectedConversationId,
            expectedVersion,
            expectedGeneration,
          ) &&
          verificationRef.current === target.id
        ) {
          verificationRef.current = null;
        }
      }
    },
    [applyProcessingResult, conversationId, isCurrentConversation],
  );

  useEffect(() => {
    conversationVersionRef.current += 1;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    conversationIdRef.current = conversationId;
    draftReadyRef.current = null;
    verificationRef.current = null;
    assetRef.current = null;
    setText('');
    setAsset(null);
    setUploading(false);
    setDraftReadyFor(null);
    let active = true;
    void readDraft(conversationId)
      .then((draft) => {
        if (
          !active ||
          !isCurrentConversation(
            conversationId,
            expectedVersion,
            expectedGeneration,
          )
        )
          return;
        const restored: Attachment | null =
          draft.assetId && draft.assetUri
            ? { id: draft.assetId, uri: draft.assetUri, state: 'timeout' }
            : null;
        draftReadyRef.current = conversationId;
        assetRef.current = restored;
        setDraftReadyFor(conversationId);
        setText(draft.text);
        setAsset(restored);
      })
      .catch(() => {
        if (
          active &&
          isCurrentConversation(
            conversationId,
            expectedVersion,
            expectedGeneration,
          )
        ) {
          draftReadyRef.current = conversationId;
          setDraftReadyFor(conversationId);
        }
      });
    return () => {
      active = false;
      if (
        mountedRef.current &&
        lifecycleGenerationRef.current === expectedGeneration
      ) {
        conversationVersionRef.current += 1;
        conversationIdRef.current = '';
        draftReadyRef.current = null;
        verificationRef.current = null;
        assetRef.current = null;
      }
    };
  }, [conversationId, isCurrentConversation]);

  useEffect(() => {
    if (
      draftReadyFor !== conversationId ||
      draftReadyRef.current !== conversationId
    )
      return undefined;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    const timeout = setTimeout(() => {
      if (
        !isCurrentConversation(
          conversationId,
          expectedVersion,
          expectedGeneration,
        ) ||
        draftReadyRef.current !== conversationId
      )
        return;
      void saveDraft(conversationId, {
        text,
        assetId: asset?.id ?? null,
        assetUri: asset?.uri ?? null,
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [asset, conversationId, draftReadyFor, isCurrentConversation, text]);

  useEffect(() => {
    const current = assetRef.current;
    if (!online || !current || current.state === 'ready') return;
    void verifyAsset(current);
  }, [asset?.id, online, verifyAsset]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      const current = assetRef.current;
      if (state === 'active' && online && current) void verifyAsset(current);
    });
    return () => subscription.remove();
  }, [online, verifyAsset]);

  const attach = async (): Promise<void> => {
    const expectedConversationId = conversationId;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    if (draftReadyFor !== conversationId) return;
    if (!online) {
      Alert.alert('오프라인', '이미지 업로드는 온라인에서만 가능합니다.');
      return;
    }
    setUploading(true);
    let uploadedId: string | null = null;
    try {
      const uploaded = await selectAndUploadAsset(conversationId);
      if (!uploaded) return;
      uploadedId = uploaded.id;
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      const previous = assetRef.current;
      const previousId = previous?.id ?? null;
      if (previous) {
        await removeUploadedAsset(previous.id);
        if (
          !isCurrentConversation(
            expectedConversationId,
            expectedVersion,
            expectedGeneration,
          ) ||
          assetRef.current?.id !== previousId
        ) {
          await bestEffortRemoveUploadedAsset(uploaded.id);
          uploadedId = null;
          return;
        }
      }
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      const next: Attachment = { ...uploaded, state: 'processing' };
      if (Platform.OS === 'ios') await Haptics.selectionAsync();
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      assetRef.current = next;
      setAsset(next);
      uploadedId = null;
    } catch (error) {
      if (uploadedId) await bestEffortRemoveUploadedAsset(uploadedId);
      if (
        isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        Alert.alert(
          '이미지 첨부 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
      }
    } finally {
      if (
        isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        setUploading(false);
      }
    }
  };

  const remove = async (): Promise<void> => {
    const current = assetRef.current;
    const expectedConversationId = conversationId;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    if (!current) return;
    if (!online) {
      Alert.alert('오프라인', '온라인에서 첨부 이미지를 삭제할 수 있습니다.');
      return;
    }
    try {
      await removeUploadedAsset(current.id);
    } catch (error) {
      if (
        isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        ) &&
        assetRef.current?.id === current.id
      ) {
        Alert.alert(
          '이미지 제거 실패',
          error instanceof Error && error.message
            ? error.message
            : '다시 시도해 주세요.',
        );
      }
      return;
    }
    if (
      !isCurrentConversation(
        expectedConversationId,
        expectedVersion,
        expectedGeneration,
      ) ||
      assetRef.current?.id !== current.id
    )
      return;
    assetRef.current = null;
    setAsset(null);
  };

  const send = async (): Promise<void> => {
    const expectedConversationId = conversationId;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    if (draftReadyFor !== conversationId) return;
    const currentText = draftReadyFor === conversationId ? text : '';
    const currentAsset = draftReadyFor === conversationId ? asset : null;
    const trimmed = currentText.trim();
    if (
      (!trimmed && !currentAsset) ||
      !online ||
      loading ||
      uploading ||
      (currentAsset && currentAsset.state !== 'ready')
    )
      return;
    try {
      if (currentAsset) {
        const status = await readAssetStatus(currentAsset.id);
        if (
          !isCurrentConversation(
            expectedConversationId,
            expectedVersion,
            expectedGeneration,
          )
        )
          return;
        if (status !== 'READY') {
          if (status === 'REJECTED')
            applyProcessingResult(currentAsset.id, 'REJECTED');
          else void verifyAsset(currentAsset);
          return;
        }
      }
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      )
        return;
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      )
        return;
      await onSend(trimmed, currentAsset?.id ?? null);
      if (
        !isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      )
        return;
      setText('');
      setAsset(null);
      await deleteDraft(expectedConversationId);
    } catch (error) {
      if (
        isCurrentConversation(
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        Alert.alert(
          '메시지 전송 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
      }
    }
  };

  const draftReady = draftReadyFor === conversationId;
  const visibleAsset = draftReady ? asset : null;
  const visibleText = draftReady ? text : '';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {!online ? (
        <Text
          accessibilityLiveRegion="polite"
          allowFontScaling
          style={styles.offline}
        >
          오프라인 · 초안은 이 기기에 저장됩니다
        </Text>
      ) : null}
      {!draftReady ? (
        <Text
          accessibilityLiveRegion="polite"
          allowFontScaling
          style={styles.draftStatus}
        >
          초안을 불러오는 중입니다
        </Text>
      ) : null}
      {visibleAsset ? (
        <View style={styles.attachment}>
          <Image
            accessibilityLabel="첨부한 상품 사진"
            contentFit="cover"
            source={visibleAsset.uri}
            style={styles.thumbnail}
          />
          <Pressable
            accessibilityRole="button"
            onPress={() => void remove()}
            style={styles.removeButton}
          >
            <Text allowFontScaling style={styles.removeLabel}>
              이미지 제거
            </Text>
          </Pressable>
          {visibleAsset.state !== 'ready' ? (
            <View style={styles.assetStatus}>
              <Text
                accessibilityLiveRegion="polite"
                allowFontScaling
                style={styles.statusLabel}
              >
                {visibleAsset.state === 'timeout'
                  ? '처리 확인 시간이 초과되었습니다'
                  : '이미지 처리 중'}
              </Text>
              {visibleAsset.state === 'timeout' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void verifyAsset(visibleAsset)}
                  style={styles.retryButton}
                >
                  <Text allowFontScaling style={styles.retryLabel}>
                    상태 다시 확인
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      <View style={styles.root}>
        <Pressable
          accessibilityLabel="이미지 첨부"
          accessibilityRole="button"
          disabled={loading || uploading || !draftReady}
          hitSlop={4}
          onPress={() => void attach()}
          style={styles.iconButton}
        >
          <Text
            allowFontScaling
            maxFontSizeMultiplier={2}
            style={styles.iconLabel}
          >
            {uploading ? '첨부 중' : '첨부'}
          </Text>
        </Pressable>
        <TextInput
          accessibilityLabel="쇼핑 질문"
          editable={!loading && draftReady}
          maxLength={2_000}
          multiline
          blurOnSubmit={false}
          onChangeText={setText}
          placeholder="원하는 상품과 조건을 알려주세요"
          placeholderTextColor={styles.placeholder.color}
          returnKeyType="default"
          scrollEnabled
          style={styles.input}
          value={visibleText}
        />
        <Pressable
          accessibilityLabel={loading ? '응답 중지' : '메시지 보내기'}
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              !online ||
              uploading ||
              (!loading &&
                (!draftReady ||
                  Boolean(visibleAsset && visibleAsset.state !== 'ready'))),
          }}
          disabled={
            !online ||
            uploading ||
            (!loading &&
              (!draftReady ||
                Boolean(visibleAsset && visibleAsset.state !== 'ready')))
          }
          onPress={() => void (loading ? onStop() : send())}
          style={({ pressed }) => [
            styles.sendButton,
            pressed && styles.pressed,
          ]}
        >
          <Text allowFontScaling style={styles.sendLabel}>
            {loading ? '중지' : '전송'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create((theme, runtime) => ({
  root: {
    alignItems: 'flex-end',
    backgroundColor: theme.colors.background,
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.sm,
    padding: theme.spacing.md,
    paddingBottom: Math.max(theme.spacing.md, runtime.insets.bottom),
  },
  input: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    color: theme.colors.text,
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    maxHeight: 132,
    minHeight: 48,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  placeholder: { color: theme.colors.textMuted },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    minWidth: 48,
    paddingHorizontal: theme.spacing.sm,
  },
  iconLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '400' },
  sendButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.sm,
    height: 48,
    justifyContent: 'center',
    minWidth: 60,
    paddingHorizontal: theme.spacing.md,
  },
  sendLabel: {
    color: theme.colors.primaryText,
    fontSize: 14,
    fontWeight: '800',
  },
  pressed: { opacity: 0.72 },
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
  thumbnail: { borderRadius: theme.radii.sm, height: 64, width: 64 },
  removeButton: { minHeight: 44, justifyContent: 'center' },
  removeLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
  assetStatus: { flex: 1, gap: theme.spacing.xs },
  statusLabel: { color: theme.colors.textMuted, fontSize: 13 },
  retryButton: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryLabel: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
}));

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

export const ChatComposer = ({
  conversationId,
  loading,
  onSend,
  onStop,
}: ChatComposerProps) => {
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const online = useOnline();
  const assetRef = useRef<Attachment | null>(null);
  const verificationRef = useRef<string | null>(null);

  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);

  const applyProcessingResult = useCallback(
    (id: string, result: Awaited<ReturnType<typeof pollAssetUntilSettled>>): void => {
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
      if (verificationRef.current === target.id) return;
      verificationRef.current = target.id;
      setAsset((current) =>
        current?.id === target.id ? { ...current, state: 'checking' } : current,
      );
      try {
        applyProcessingResult(target.id, await pollAssetUntilSettled(target.id));
      } catch (error) {
        setAsset((current) =>
          current?.id === target.id ? { ...current, state: 'timeout' } : current,
        );
        Alert.alert(
          '이미지 상태 확인 실패',
          error instanceof Error ? error.message : '연결을 확인하고 다시 시도해 주세요.',
        );
      } finally {
        if (verificationRef.current === target.id) verificationRef.current = null;
      }
    },
    [applyProcessingResult],
  );

  useEffect(() => {
    void readDraft(conversationId).then((draft) => {
      setText(draft.text);
      const restored: Attachment | null =
        draft.assetId && draft.assetUri
          ? { id: draft.assetId, uri: draft.assetUri, state: 'timeout' }
          : null;
      assetRef.current = restored;
      setAsset(restored);
    });
  }, [conversationId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void saveDraft(conversationId, {
        text,
        assetId: asset?.id ?? null,
        assetUri: asset?.uri ?? null,
      });
    }, 250);
    return () => clearTimeout(timeout);
  }, [asset, conversationId, text]);

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
    if (!online) {
      Alert.alert('오프라인', '이미지 업로드는 온라인에서만 가능합니다.');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await selectAndUploadAsset(conversationId);
      if (!uploaded) return;
      if (asset) await removeUploadedAsset(asset.id);
      const next: Attachment = { ...uploaded, state: 'processing' };
      assetRef.current = next;
      setAsset(next);
      await Haptics.selectionAsync();
    } catch (error) {
      Alert.alert(
        '이미지 첨부 실패',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    } finally {
      setUploading(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!asset) return;
    if (!online) {
      Alert.alert('오프라인', '온라인에서 첨부 이미지를 삭제할 수 있습니다.');
      return;
    }
    await removeUploadedAsset(asset.id);
    assetRef.current = null;
    setAsset(null);
  };

  const send = async (): Promise<void> => {
    const trimmed = text.trim();
    if (
      (!trimmed && !asset) ||
      !online ||
      loading ||
      uploading ||
      (asset && asset.state !== 'ready')
    )
      return;
    try {
      if (asset) {
        const status = await readAssetStatus(asset.id);
        if (status !== 'READY') {
          if (status === 'REJECTED') applyProcessingResult(asset.id, 'REJECTED');
          else void verifyAsset(asset);
          return;
        }
      }
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await onSend(trimmed, asset?.id ?? null);
      setText('');
      setAsset(null);
      await deleteDraft(conversationId);
    } catch (error) {
      Alert.alert(
        '메시지 전송 실패',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {!online ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.offline}>
          오프라인 · 초안은 이 기기에 저장됩니다
        </Text>
      ) : null}
      {asset ? (
        <View style={styles.attachment}>
          <Image
            accessibilityLabel="첨부한 상품 사진"
            contentFit="cover"
            source={asset.uri}
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
          {asset.state !== 'ready' ? (
            <View style={styles.assetStatus}>
              <Text
                accessibilityLiveRegion="polite"
                allowFontScaling
                style={styles.statusLabel}
              >
                {asset.state === 'timeout'
                  ? '처리 확인 시간이 초과되었습니다'
                  : '이미지 처리 중'}
              </Text>
              {asset.state === 'timeout' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void verifyAsset(asset)}
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
          disabled={loading || uploading}
          onPress={() => void attach()}
          style={styles.iconButton}
        >
          <Text allowFontScaling style={styles.iconLabel}>
            {uploading ? '…' : '+'}
          </Text>
        </Pressable>
        <TextInput
          accessibilityLabel="쇼핑 질문"
          editable={!loading}
          maxLength={2_000}
          multiline
          onChangeText={setText}
          placeholder="원하는 상품과 조건을 알려주세요"
          placeholderTextColor={styles.placeholder.color}
          style={styles.input}
          value={text}
        />
        <Pressable
          accessibilityLabel={loading ? '응답 중지' : '메시지 보내기'}
          accessibilityRole="button"
          accessibilityState={{
            disabled:
              !online ||
              uploading ||
              (!loading && Boolean(asset && asset.state !== 'ready')),
          }}
          disabled={
            !online ||
            uploading ||
            (!loading && Boolean(asset && asset.state !== 'ready'))
          }
          onPress={() => void (loading ? onStop() : send())}
          style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}
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
    borderRadius: theme.radii.lg,
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
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  iconLabel: { color: theme.colors.text, fontSize: 26, fontWeight: '400' },
  sendButton: {
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    minWidth: 60,
    paddingHorizontal: theme.spacing.md,
  },
  sendLabel: { color: theme.colors.primaryText, fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
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
  retryButton: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  retryLabel: { color: theme.colors.primary, fontSize: 14, fontWeight: '700' },
}));

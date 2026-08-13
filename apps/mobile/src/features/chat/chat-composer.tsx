import { useEffect, useState } from 'react';
import {
  Alert,
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

type ChatComposerProps = Readonly<{
  conversationId: string;
  loading: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
}>;

export const ChatComposer = ({ conversationId, loading, onSend }: ChatComposerProps) => {
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<UploadedAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const online = useOnline();

  useEffect(() => {
    void readDraft(conversationId).then((draft) => {
      setText(draft.text);
      setAsset(
        draft.assetId && draft.assetUri
          ? { id: draft.assetId, uri: draft.assetUri }
          : null,
      );
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
      setAsset(uploaded);
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
    setAsset(null);
  };

  const send = async (): Promise<void> => {
    const trimmed = text.trim();
    if ((!trimmed && !asset) || !online || loading || uploading) return;
    try {
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
          accessibilityLabel="메시지 보내기"
          accessibilityRole="button"
          accessibilityState={{ disabled: !online || loading || uploading }}
          disabled={!online || loading || uploading}
          onPress={() => void send()}
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
}));

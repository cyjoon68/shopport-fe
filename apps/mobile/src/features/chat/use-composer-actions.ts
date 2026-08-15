import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { readAssetStatus } from './asset-status';
import { removeUploadedAsset, selectAndUploadAsset } from './asset-upload';
import type { Attachment } from './chat-composer-types';
import type { useComposerState } from './use-composer-state';

type State = ReturnType<typeof useComposerState>;
type Args = Readonly<{
  allowFreeText: boolean;
  conversationId: string;
  loading: boolean;
  onSend: (text: string, assetId: string | null) => Promise<void>;
  online: boolean;
  state: State;
}>;

const bestEffortRemoveUploadedAsset = async (id: string) => {
  try {
    await removeUploadedAsset(id);
  } catch {
    return;
  }
};

export const useComposerActions = ({
  allowFreeText,
  conversationId,
  loading,
  onSend,
  online,
  state,
}: Args) => {
  const currentSnapshot = () => ({
    generation: state.lifecycleGenerationRef.current,
    version: state.conversationVersionRef.current,
  });
  const isCurrent = ({ generation, version }: ReturnType<typeof currentSnapshot>) =>
    state.isCurrentConversation(conversationId, version, generation);

  const attach = async () => {
    const expected = currentSnapshot();
    if (state.draftReadyFor !== conversationId) return;
    if (!online) {
      Alert.alert('오프라인', '이미지 업로드는 온라인에서만 가능합니다.');
      return;
    }
    state.setUploading(true);
    let uploadedId: string | null = null;
    try {
      const uploaded = await selectAndUploadAsset(conversationId);
      if (!uploaded) return;
      uploadedId = uploaded.id;
      if (!isCurrent(expected)) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      const previous = state.assetRef.current;
      const previousId = previous?.id ?? null;
      if (previous) {
        await removeUploadedAsset(previous.id);
        if (!isCurrent(expected) || state.assetRef.current?.id !== previousId) {
          await bestEffortRemoveUploadedAsset(uploaded.id);
          uploadedId = null;
          return;
        }
      }
      if (!isCurrent(expected)) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      const next: Attachment = { ...uploaded, state: 'processing' };
      if (Platform.OS === 'ios') await Haptics.selectionAsync();
      if (!isCurrent(expected)) {
        await bestEffortRemoveUploadedAsset(uploaded.id);
        uploadedId = null;
        return;
      }
      state.assetRef.current = next;
      state.setAsset(next);
      uploadedId = null;
    } catch (error) {
      if (uploadedId) await bestEffortRemoveUploadedAsset(uploadedId);
      if (isCurrent(expected))
        Alert.alert(
          '이미지 첨부 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
    } finally {
      if (isCurrent(expected)) state.setUploading(false);
    }
  };

  const remove = async () => {
    const current = state.assetRef.current;
    const expected = currentSnapshot();
    if (!current) return;
    if (!online) {
      Alert.alert('오프라인', '온라인에서 첨부 이미지를 삭제할 수 있습니다.');
      return;
    }
    try {
      await removeUploadedAsset(current.id);
    } catch (error) {
      if (isCurrent(expected) && state.assetRef.current?.id === current.id) {
        Alert.alert(
          '이미지 제거 실패',
          error instanceof Error && error.message ? error.message : '다시 시도해 주세요.',
        );
      }
      return;
    }
    if (!isCurrent(expected) || state.assetRef.current?.id !== current.id) return;
    state.assetRef.current = null;
    state.setAsset(null);
  };

  const send = useCallback(async () => {
    const expected = currentSnapshot();
    if (state.draftReadyFor !== conversationId) return;
    const currentText = state.text;
    const currentAsset = state.asset;
    const trimmed = currentText.trim();
    if (
      !allowFreeText ||
      (!trimmed && !currentAsset) ||
      !online ||
      loading ||
      state.uploading ||
      (currentAsset && currentAsset.state !== 'ready')
    )
      return;
    try {
      if (currentAsset) {
        const status = await readAssetStatus(currentAsset.id);
        if (!isCurrent(expected)) return;
        if (status !== 'READY') {
          if (status === 'REJECTED')
            state.applyProcessingResult(currentAsset.id, 'REJECTED');
          else void state.verifyAsset(currentAsset);
          return;
        }
      }
      if (!isCurrent(expected)) return;
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!isCurrent(expected)) return;
      await onSend(trimmed, currentAsset?.id ?? null);
      if (!isCurrent(expected)) return;
      state.setText('');
      state.setAsset(null);
      await state.deleteDraft(conversationId);
    } catch (error) {
      if (isCurrent(expected))
        Alert.alert(
          '메시지 전송 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
    }
  }, [allowFreeText, conversationId, loading, onSend, online, state]);

  return { attach, remove, send };
};

import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Keyboard, Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import { deleteDraft, readDraft, saveDraft } from '@/shared/storage';

import {
  pollAssetUntilSettled,
  readAssetStatus,
  removeUploadedAsset,
} from './api/fetchers';
import { selectAndUploadAsset } from './attachments';
import type {
  Attachment,
  ComposerActionsArgs,
  ComposerLifecycle,
  ComposerState,
} from './types';

const isCurrentComposerConversation = (
  lifecycle: ComposerLifecycle,
  id: string,
  version: number,
  generation = lifecycle.generation,
): boolean =>
  lifecycle.mounted &&
  lifecycle.generation === generation &&
  lifecycle.conversationId === id &&
  lifecycle.version === version;

export const useComposerState = (
  conversationId: string,
  online: boolean,
): ComposerState => {
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null);
  const assetRef = useRef<Attachment | null>(null);
  const verificationRef = useRef<string | null>(null);
  const draftReadyRef = useRef<string | null>(null);
  const lifecycleRef = useRef<ComposerLifecycle>({
    conversationId,
    generation: 0,
    mounted: false,
    version: 0,
  });
  const isCurrentConversation = (
    id: string,
    version: number,
    generation = lifecycleRef.current.generation,
  ): boolean =>
    isCurrentComposerConversation(lifecycleRef.current, id, version, generation);

  useEffect(() => {
    lifecycleRef.current.mounted = true;
    lifecycleRef.current.generation += 1;
    return () => {
      lifecycleRef.current.mounted = false;
      lifecycleRef.current.generation += 1;
      lifecycleRef.current.version += 1;
      lifecycleRef.current.conversationId = '';
      draftReadyRef.current = null;
      verificationRef.current = null;
      assetRef.current = null;
    };
  }, []);

  useEffect(() => {
    assetRef.current = asset;
  }, [asset]);

  const applyProcessingResult = (
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
  };

  const verifyAsset = async (target: Attachment): Promise<void> => {
    const lifecycle = lifecycleRef.current;
    const expectedConversationId = lifecycle.conversationId;
    const expectedVersion = lifecycle.version;
    const expectedGeneration = lifecycle.generation;
    if (
      !isCurrentComposerConversation(
        lifecycle,
        expectedConversationId,
        expectedVersion,
        expectedGeneration,
      ) ||
      verificationRef.current === target.id
    )
      return;
    verificationRef.current = target.id;
    setAsset((current) =>
      current?.id === target.id ? { ...current, state: 'checking' } : current,
    );
    try {
      const result = await pollAssetUntilSettled(target.id);
      if (
        isCurrentComposerConversation(
          lifecycle,
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      )
        applyProcessingResult(target.id, result);
    } catch (error) {
      if (
        isCurrentComposerConversation(
          lifecycle,
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        )
      ) {
        setAsset((current) =>
          current?.id === target.id ? { ...current, state: 'timeout' } : current,
        );
        Alert.alert(
          '이미지 상태 확인 실패',
          error instanceof Error ? error.message : '연결을 확인하고 다시 시도해 주세요.',
        );
      }
    } finally {
      if (
        isCurrentComposerConversation(
          lifecycle,
          expectedConversationId,
          expectedVersion,
          expectedGeneration,
        ) &&
        verificationRef.current === target.id
      )
        verificationRef.current = null;
    }
  };

  useEffect(() => {
    const lifecycle = lifecycleRef.current;
    lifecycle.version += 1;
    const expectedVersion = lifecycle.version;
    const expectedGeneration = lifecycle.generation;
    lifecycle.conversationId = conversationId;
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
          !isCurrentComposerConversation(
            lifecycle,
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
          isCurrentComposerConversation(
            lifecycle,
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
      if (lifecycle.mounted && lifecycle.generation === expectedGeneration) {
        lifecycle.version += 1;
        lifecycle.conversationId = '';
        draftReadyRef.current = null;
        verificationRef.current = null;
        assetRef.current = null;
      }
    };
  }, [conversationId]);

  useEffect(() => {
    if (draftReadyFor !== conversationId || draftReadyRef.current !== conversationId)
      return undefined;
    const lifecycle = lifecycleRef.current;
    const expectedVersion = lifecycle.version;
    const expectedGeneration = lifecycle.generation;
    const timeout = setTimeout(() => {
      if (
        !isCurrentComposerConversation(
          lifecycle,
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
  }, [asset, conversationId, draftReadyFor, text]);

  useEffect(() => {
    const current = assetRef.current;
    if (online && current && current.state !== 'ready') void verifyAsset(current);
  }, [asset?.id, online]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const current = assetRef.current;
      if (status === 'active' && online && current) void verifyAsset(current);
    });
    return () => subscription.remove();
  }, [online]);

  return {
    applyProcessingResult,
    asset,
    assetRef,
    draftReadyFor,
    isCurrentConversation,
    lifecycleRef,
    setAsset,
    setText,
    setUploading,
    text,
    uploading,
    verifyAsset,
    deleteDraft,
  };
};

const bestEffortRemoveUploadedAsset = async (id: string): Promise<void> => {
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
}: ComposerActionsArgs) => {
  const currentSnapshot = () => ({
    generation: state.lifecycleRef.current.generation,
    version: state.lifecycleRef.current.version,
  });
  const isCurrent = ({ generation, version }: ReturnType<typeof currentSnapshot>) =>
    state.isCurrentConversation(conversationId, version, generation);

  const attach = async (): Promise<void> => {
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

  const remove = async (): Promise<void> => {
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

  const send = async (): Promise<boolean> => {
    const expected = currentSnapshot();
    if (state.draftReadyFor !== conversationId) return false;
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
      return false;
    try {
      if (currentAsset) {
        const status = await readAssetStatus(currentAsset.id);
        if (!isCurrent(expected)) return false;
        if (status !== 'READY') {
          if (status === 'REJECTED')
            state.applyProcessingResult(currentAsset.id, 'REJECTED');
          else void state.verifyAsset(currentAsset);
          return false;
        }
      }
      if (!isCurrent(expected)) return false;
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (!isCurrent(expected)) return false;
      await onSend(trimmed, currentAsset?.id ?? null);
      if (!isCurrent(expected)) return false;
      await state.deleteDraft(conversationId);
      if (isCurrent(expected)) {
        state.assetRef.current = null;
        state.setText('');
        state.setAsset(null);
      }
      return true;
    } catch (error) {
      if (isCurrent(expected))
        Alert.alert(
          '메시지 전송 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
      return false;
    }
  };

  return { attach, remove, send };
};

export const useKeyboardLift = (): Animated.Value => {
  const keyboardLift = useRef(new Animated.Value(0)).current;
  const insetBottom = initialWindowMetrics?.insets.bottom ?? 0;
  useEffect(() => {
    const liftTo = (next: number): void => {
      keyboardLift.setValue(next);
    };
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillChangeFrame' : 'keyboardDidShow',
      (event) => {
        liftTo(Math.max(0, event.endCoordinates.height - insetBottom));
      },
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => liftTo(0),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, [insetBottom, keyboardLift]);
  return keyboardLift;
};

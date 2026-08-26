import { useMutation } from '@apollo/client/react';
import * as Haptics from 'expo-haptics';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Animated, AppState, Keyboard, Platform } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';

import {
  DeleteConversationDocument,
  RenameConversationDocument,
} from '@/graphql/generated/graphql';
import {
  deleteDraft,
  readDraft,
  saveDraft,
  setConversationPinned,
  sqliteChatPersistence,
} from '@/shared/storage';

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
  ConversationActionProps,
} from './types';

export const useConversationActions = ({
  conversation,
  onDeleted,
  online,
  pinned,
  onPinnedChange,
  onRefresh,
}: ConversationActionProps): {
  remove: () => void;
  rename: (title: string) => Promise<boolean>;
  togglePin: () => void;
} => {
  const activeRef = useRef(true);
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const [renameConversation] = useMutation(RenameConversationDocument);
  const [deleteConversation] = useMutation(DeleteConversationDocument);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  const togglePin = (): void => {
    if (!activeRef.current) return;
    const nextPinned = !pinned;
    void setConversationPinned(conversation.id, nextPinned)
      .then(() => {
        if (activeRef.current) onPinnedChange(conversation.id, nextPinned);
      })
      .catch(() => {
        if (activeRef.current) Alert.alert('오류', '고정 상태를 저장하지 못했습니다.');
      });
  };

  const rename = async (title: string): Promise<boolean> => {
    if (!activeRef.current) return false;
    if (!onlineRef.current) {
      Alert.alert('오프라인', '대화 이름 변경은 온라인에서 할 수 있습니다.');
      return false;
    }
    const nextTitle = title.trim();
    if (!nextTitle) return false;
    try {
      const result = await renameConversation({
        variables: { input: { id: conversation.id, title: nextTitle } },
      });
      if (!activeRef.current) return false;
      const message = result.data?.renameConversation.userErrors[0]?.message;
      if (message) {
        Alert.alert('이름 변경 실패', message);
        return false;
      }
      if (onlineRef.current) {
        try {
          await onRefresh();
        } catch {
          Alert.alert(
            '이름 변경 완료',
            '서버에서 이름은 변경됐지만 목록을 새로 고치지 못했습니다.',
          );
        }
      }
      return true;
    } catch {
      if (activeRef.current) Alert.alert('이름 변경 실패', '다시 시도해 주세요.');
      return false;
    }
  };

  const remove = (): void => {
    if (!activeRef.current) return;
    if (!onlineRef.current) {
      Alert.alert('오프라인', '대화 삭제는 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.alert('대화를 삭제할까요?', '메시지와 첨부 이미지도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          if (!activeRef.current || !onlineRef.current) return;
          void deleteConversation({ variables: { input: { id: conversation.id } } })
            .then(async (result) => {
              const payload = result.data?.deleteConversation;
              if (!payload?.success) {
                if (activeRef.current && onlineRef.current)
                  Alert.alert(
                    '삭제 실패',
                    payload?.userErrors[0]?.message ?? '다시 시도해 주세요.',
                  );
                return;
              }
              if (activeRef.current && onlineRef.current) onDeleted(conversation.id);
              const cleanupResults = await Promise.allSettled([
                sqliteChatPersistence.removeItem(conversation.id),
                setConversationPinned(conversation.id, false),
                deleteDraft(conversation.id),
              ]);
              const cacheCleanupFailed = cleanupResults.some(
                ({ status }) => status === 'rejected',
              );
              if (!activeRef.current || !onlineRef.current) return;
              try {
                await onRefresh();
              } catch {
                if (!activeRef.current || !onlineRef.current) return;
                Alert.alert(
                  '삭제 완료',
                  cacheCleanupFailed
                    ? '서버에서 삭제되었지만 기기 캐시와 목록을 새로 고치지 못했습니다.'
                    : '서버에서 삭제되었지만 목록을 새로 고치지 못했습니다.',
                );
                return;
              }
              if (!activeRef.current || !onlineRef.current) return;
              if (cacheCleanupFailed) {
                Alert.alert(
                  '삭제 완료',
                  '서버에서 삭제되었지만 기기 캐시를 정리하지 못했습니다.',
                );
              }
            })
            .catch(() => {
              if (activeRef.current && onlineRef.current)
                Alert.alert('삭제 실패', '다시 시도해 주세요.');
            });
        },
      },
    ]);
  };

  return { remove, rename, togglePin };
};

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
      setAsset((current) =>
        current?.id === id ? { ...current, state: 'rejected' } : current,
      );
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
    if (online && current && current.state !== 'ready' && current.state !== 'rejected')
      void verifyAsset(current);
  }, [asset?.id, online]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const current = assetRef.current;
      if (status === 'active' && online && current && current.state !== 'rejected')
        void verifyAsset(current);
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
  const sendInFlightRef = useRef(false);
  const initialDraftRetiredRef = useRef(false);
  const submittedDraftRef = useRef<{
    conversationId: string;
    revision: number;
  } | null>(null);
  const pendingRestoreRef = useRef<{
    conversationId: string;
    revision: number;
  } | null>(null);
  const restoreInFlightRef = useRef(false);
  const draftRevisionRef = useRef({
    assetId: state.asset?.id ?? null,
    conversationId,
    revision: 0,
    text: state.text,
  });
  const draftCandidate = {
    assetId: state.asset?.id ?? null,
    conversationId,
    text: state.text,
  };
  const latestRef = useRef({
    allowFreeText,
    asset: state.asset,
    conversationId,
    draftReadyFor: state.draftReadyFor,
    loading,
    online,
    revision: draftRevisionRef.current.revision,
    text: state.text,
    uploading: state.uploading,
  });
  const latestCandidate = {
    allowFreeText,
    asset: state.asset,
    conversationId,
    draftReadyFor: state.draftReadyFor,
    loading,
    online,
    text: state.text,
    uploading: state.uploading,
  };
  useLayoutEffect(() => {
    const previousDraft = draftRevisionRef.current;
    const changed =
      previousDraft.conversationId !== draftCandidate.conversationId ||
      previousDraft.text !== draftCandidate.text ||
      previousDraft.assetId !== draftCandidate.assetId;
    const nextDraft = changed
      ? {
          ...draftCandidate,
          revision: previousDraft.revision + 1,
        }
      : previousDraft;
    if (changed) {
      draftRevisionRef.current = nextDraft;
      submittedDraftRef.current = null;
    }
    latestRef.current = { ...latestCandidate, revision: nextDraft.revision };
  });
  const currentSnapshot = () => ({
    generation: state.lifecycleRef.current.generation,
    version: state.lifecycleRef.current.version,
  });
  const isCurrent = ({ generation, version }: ReturnType<typeof currentSnapshot>) =>
    state.isCurrentConversation(conversationId, version, generation);
  const isEligible = (snapshot: typeof latestRef.current): boolean =>
    snapshot.allowFreeText &&
    snapshot.conversationId === conversationId &&
    snapshot.draftReadyFor === conversationId &&
    Boolean(snapshot.text.trim() || snapshot.asset) &&
    snapshot.online &&
    !snapshot.loading &&
    !snapshot.uploading &&
    (!snapshot.asset || snapshot.asset.state === 'ready');
  const matchesDraft = (snapshot: typeof latestRef.current, revision: number): boolean =>
    snapshot.conversationId === conversationId &&
    snapshot.draftReadyFor === conversationId &&
    snapshot.revision === revision;
  const saveLatestDraft = async (): Promise<boolean> => {
    if (restoreInFlightRef.current) return false;
    restoreInFlightRef.current = true;
    try {
      while (true) {
        const current = latestRef.current;
        if (current.conversationId !== conversationId) {
          if (pendingRestoreRef.current?.conversationId === conversationId)
            pendingRestoreRef.current = null;
          return true;
        }
        try {
          await saveDraft(conversationId, {
            text: current.text,
            assetId: current.asset?.id ?? null,
            assetUri: current.asset?.uri ?? null,
          });
        } catch {
          if (latestRef.current.conversationId === conversationId) {
            pendingRestoreRef.current = {
              conversationId,
              revision: current.revision,
            };
            if (isCurrent(currentSnapshot()))
              Alert.alert(
                '초안 저장 실패',
                '메시지는 전송되었지만 최신 초안을 저장하지 못했습니다.',
              );
          }
          return false;
        }
        const latest = latestRef.current;
        if (latest.conversationId !== conversationId) {
          if (pendingRestoreRef.current?.conversationId === conversationId)
            pendingRestoreRef.current = null;
          return true;
        }
        if (latest.revision === current.revision) {
          if (pendingRestoreRef.current?.conversationId === conversationId)
            pendingRestoreRef.current = null;
          return true;
        }
      }
    } finally {
      restoreInFlightRef.current = false;
      const pending = pendingRestoreRef.current;
      const latest = latestRef.current;
      if (
        pending &&
        pending.conversationId === conversationId &&
        latest.conversationId === conversationId &&
        latest.revision !== pending.revision
      )
        void saveLatestDraft();
    }
  };

  useEffect(() => {
    const pending = pendingRestoreRef.current;
    const latest = latestRef.current;
    if (
      pending &&
      pending.conversationId === conversationId &&
      latest.conversationId === conversationId &&
      latest.revision !== pending.revision
    )
      void saveLatestDraft();
  }, [conversationId, state.asset?.id, state.text]);

  const cleanupSubmittedDraft = async (
    expected: ReturnType<typeof currentSnapshot>,
    revision: number,
  ): Promise<boolean> => {
    const current = latestRef.current;
    if (current.conversationId === conversationId && !matchesDraft(current, revision)) {
      const saved = await saveLatestDraft();
      if (!saved) initialDraftRetiredRef.current = true;
      return saved;
    }
    try {
      await state.deleteDraft(conversationId);
    } catch {
      if (isCurrent(expected))
        Alert.alert(
          '초안 정리 실패',
          '메시지는 전송되었지만 초안을 정리하지 못했습니다.',
        );
      return false;
    }
    const latest = latestRef.current;
    if (latest.conversationId === conversationId && !matchesDraft(latest, revision)) {
      await saveLatestDraft();
      return true;
    }
    if (isCurrent(expected) && matchesDraft(latest, revision)) {
      state.assetRef.current = null;
      state.setText('');
      state.setAsset(null);
    }
    return true;
  };

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
    const current = latestRef.current;
    const trimmed = current.text.trim();
    const assetId = current.asset?.id ?? null;
    if (sendInFlightRef.current) return false;
    const submitted = submittedDraftRef.current;
    const retryingSubmittedDraft =
      submitted &&
      submitted.conversationId === conversationId &&
      submitted.revision === current.revision;
    if (!retryingSubmittedDraft && !isEligible(current)) return false;
    sendInFlightRef.current = true;
    try {
      if (retryingSubmittedDraft)
        return cleanupSubmittedDraft(expected, current.revision);
      if (current.asset) {
        const status = await readAssetStatus(current.asset.id);
        if (
          !isCurrent(expected) ||
          !isEligible(latestRef.current) ||
          !matchesDraft(latestRef.current, current.revision)
        )
          return false;
        if (status !== 'READY') {
          if (status === 'REJECTED')
            state.applyProcessingResult(current.asset.id, 'REJECTED');
          else void state.verifyAsset(current.asset);
          return false;
        }
      }
      if (
        !isCurrent(expected) ||
        !isEligible(latestRef.current) ||
        !matchesDraft(latestRef.current, current.revision)
      )
        return false;
      if (Platform.OS === 'ios')
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (
        !isCurrent(expected) ||
        !isEligible(latestRef.current) ||
        !matchesDraft(latestRef.current, current.revision)
      )
        return false;
      await onSend(trimmed, assetId);
      submittedDraftRef.current = { conversationId, revision: current.revision };
      return cleanupSubmittedDraft(expected, current.revision);
    } catch (error) {
      if (isCurrent(expected))
        Alert.alert(
          '메시지 전송 실패',
          error instanceof Error ? error.message : '다시 시도해 주세요.',
        );
      return false;
    } finally {
      sendInFlightRef.current = false;
    }
  };

  return { attach, initialDraftRetiredRef, remove, send };
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

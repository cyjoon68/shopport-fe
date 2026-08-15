import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState } from 'react-native';
import { deleteDraft, readDraft, saveDraft } from '@/shared/storage/database';
import { pollAssetUntilSettled } from './asset-status';
import type { Attachment } from './chat-composer-types';

export const useComposerState = (conversationId: string, online: boolean) => {
  const [text, setText] = useState('');
  const [asset, setAsset] = useState<Attachment | null>(null);
  const [uploading, setUploading] = useState(false);
  const [draftReadyFor, setDraftReadyFor] = useState<string | null>(null);
  const assetRef = useRef<Attachment | null>(null);
  const verificationRef = useRef<string | null>(null);
  const conversationIdRef = useRef(conversationId);
  const conversationVersionRef = useRef(0);
  const draftReadyRef = useRef<string | null>(null);
  const mountedRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);

  const isCurrentConversation = useCallback(
    (id: string, version: number, generation = lifecycleGenerationRef.current) =>
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
    (id: string, result: Awaited<ReturnType<typeof pollAssetUntilSettled>>) => {
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
    async (target: Attachment) => {
      const expectedVersion = conversationVersionRef.current;
      const expectedGeneration = lifecycleGenerationRef.current;
      if (
        !isCurrentConversation(conversationId, expectedVersion, expectedGeneration) ||
        verificationRef.current === target.id
      )
        return;
      verificationRef.current = target.id;
      setAsset((current) =>
        current?.id === target.id ? { ...current, state: 'checking' } : current,
      );
      try {
        const result = await pollAssetUntilSettled(target.id);
        if (isCurrentConversation(conversationId, expectedVersion, expectedGeneration))
          applyProcessingResult(target.id, result);
      } catch (error) {
        if (isCurrentConversation(conversationId, expectedVersion, expectedGeneration)) {
          setAsset((current) =>
            current?.id === target.id ? { ...current, state: 'timeout' } : current,
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
          isCurrentConversation(conversationId, expectedVersion, expectedGeneration) &&
          verificationRef.current === target.id
        )
          verificationRef.current = null;
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
          !isCurrentConversation(conversationId, expectedVersion, expectedGeneration)
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
          isCurrentConversation(conversationId, expectedVersion, expectedGeneration)
        ) {
          draftReadyRef.current = conversationId;
          setDraftReadyFor(conversationId);
        }
      });
    return () => {
      active = false;
      if (mountedRef.current && lifecycleGenerationRef.current === expectedGeneration) {
        conversationVersionRef.current += 1;
        conversationIdRef.current = '';
        draftReadyRef.current = null;
        verificationRef.current = null;
        assetRef.current = null;
      }
    };
  }, [conversationId, isCurrentConversation]);

  useEffect(() => {
    if (draftReadyFor !== conversationId || draftReadyRef.current !== conversationId)
      return undefined;
    const expectedVersion = conversationVersionRef.current;
    const expectedGeneration = lifecycleGenerationRef.current;
    const timeout = setTimeout(() => {
      if (
        !isCurrentConversation(conversationId, expectedVersion, expectedGeneration) ||
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
    if (online && current && current.state !== 'ready') void verifyAsset(current);
  }, [asset?.id, online, verifyAsset]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      const current = assetRef.current;
      if (status === 'active' && online && current) void verifyAsset(current);
    });
    return () => subscription.remove();
  }, [online, verifyAsset]);

  return {
    applyProcessingResult,
    asset,
    assetRef,
    conversationVersionRef,
    draftReadyFor,
    isCurrentConversation,
    lifecycleGenerationRef,
    setAsset,
    setText,
    setUploading,
    text,
    uploading,
    verifyAsset,
    deleteDraft,
  };
};

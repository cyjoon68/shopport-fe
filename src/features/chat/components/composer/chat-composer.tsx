import { useEffect, useRef } from 'react';

import { useOnline } from '@/providers/network-provider';

import { useComposerActions, useComposerState } from '../../hooks';
import type { ChatComposerProps } from '../../types';
import { ChatComposerView } from './chat-composer-view';

export const ChatComposer = ({
  allowFreeText = true,
  conversationId,
  draftReplacement,
  loading,
  onProviderToggle,
  onSend,
  onStop,
  providerIds,
  quickActionsEnabled = true,
  remoteWorkRef: parentRemoteWorkRef,
  retryCleanup,
  sendInitialDraft = false,
}: ChatComposerProps) => {
  const online = useOnline();
  const localRemoteWorkRef = useRef(online);
  localRemoteWorkRef.current = online;
  const remoteWorkRef = parentRemoteWorkRef ?? localRemoteWorkRef;
  const state = useComposerState(conversationId, online);
  useEffect(() => {
    if (!draftReplacement || state.draftReadyFor !== conversationId) return;
    state.setText(draftReplacement.text);
  }, [conversationId, draftReplacement, state.draftReadyFor, state.setText]);
  const { attach, cleanupRetriedDraft, initialDraftRetiredRef, remove, send } =
    useComposerActions({
      allowFreeText,
      conversationId,
      loading,
      onSend,
      online,
      remoteWorkRef,
      state,
    });
  const handledRetryCleanupRevisionRef = useRef(0);
  useEffect(() => {
    if (
      !retryCleanup ||
      state.draftReadyFor !== conversationId ||
      retryCleanup.revision <= handledRetryCleanupRevisionRef.current
    )
      return;
    handledRetryCleanupRevisionRef.current = retryCleanup.revision;
    void cleanupRetriedDraft(retryCleanup);
  }, [cleanupRetriedDraft, conversationId, retryCleanup, state.draftReadyFor]);
  const initialDraftSendingRef = useRef(false);
  const initialDraftSentRef = useRef(false);

  useEffect(() => {
    if (
      !sendInitialDraft ||
      initialDraftSendingRef.current ||
      initialDraftSentRef.current ||
      state.draftReadyFor !== conversationId ||
      !online ||
      loading ||
      state.uploading ||
      (!state.text.trim() && !state.asset) ||
      Boolean(state.asset && state.asset.state !== 'ready')
    )
      return;
    initialDraftSendingRef.current = true;
    void send()
      .then((sent) => {
        if (sent || initialDraftRetiredRef.current) initialDraftSentRef.current = true;
      })
      .finally(() => {
        initialDraftSendingRef.current = false;
      });
  }, [
    conversationId,
    loading,
    online,
    send,
    sendInitialDraft,
    state.asset,
    state.draftReadyFor,
    state.text,
    state.uploading,
  ]);

  const draftReady = state.draftReadyFor === conversationId;
  const visibleAsset = draftReady ? state.asset : null;
  const visibleText = draftReady ? state.text : '';
  const sendDisabled =
    !online ||
    state.uploading ||
    (!loading &&
      (!allowFreeText ||
        !draftReady ||
        (!visibleText.trim() && !visibleAsset) ||
        Boolean(visibleAsset && visibleAsset.state !== 'ready')));

  return (
    <ChatComposerView
      allowFreeText={allowFreeText}
      asset={visibleAsset}
      attach={attach}
      draftReady={draftReady}
      focusInput={draftReplacement?.focus}
      loading={loading}
      online={online}
      onStop={onStop}
      onProviderToggle={onProviderToggle}
      providerIds={providerIds}
      quickActionsEnabled={quickActionsEnabled}
      remove={remove}
      send={send}
      sendDisabled={sendDisabled}
      setText={state.setText}
      text={visibleText}
      uploading={state.uploading}
      verifyAsset={state.verifyAsset}
    />
  );
};

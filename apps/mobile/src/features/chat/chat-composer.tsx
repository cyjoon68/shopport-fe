import { useEffect, useRef } from 'react';
import { useOnline } from '@/providers/network-provider';
import { ChatComposerView } from './chat-composer-view';
import type { ChatComposerProps } from './chat-composer-types';
import { useComposerActions } from './use-composer-actions';
import { useComposerState } from './use-composer-state';

export const ChatComposer = ({
  allowFreeText = true,
  conversationId,
  loading,
  onProviderToggle,
  onSend,
  onStop,
  providerIds,
  quickActionsEnabled = true,
  sendInitialDraft = false,
}: ChatComposerProps) => {
  const online = useOnline();
  const state = useComposerState(conversationId, online);
  const { attach, remove, send } = useComposerActions({
    allowFreeText,
    conversationId,
    loading,
    onSend,
    online,
    state,
  });
  const initialDraftPendingRef = useRef(sendInitialDraft);

  useEffect(() => {
    if (
      !initialDraftPendingRef.current ||
      state.draftReadyFor !== conversationId ||
      !state.text.trim()
    )
      return;
    initialDraftPendingRef.current = false;
    void send();
  }, [conversationId, send, state.draftReadyFor, state.text]);

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

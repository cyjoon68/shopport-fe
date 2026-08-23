import { useCallback, useState } from 'react';
import type { RetailerId } from './chat-composer-types';
import { NewChatFooter } from './new-chat-footer';

type ChatNewConversationProps = Readonly<{
  loading: boolean;
  onCreate: (draft: string, withImage: boolean) => Promise<void>;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  online: boolean;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
}>;

export const ChatNewConversation = ({
  loading,
  onCreate,
  onProviderToggle,
  online,
  providerIds,
}: ChatNewConversationProps) => {
  const [text, setText] = useState('');
  const send = useCallback(
    async (): Promise<void> => onCreate(text.trim(), false),
    [onCreate, text],
  );
  const attach = useCallback(
    async (): Promise<void> => onCreate(text.trim(), true),
    [onCreate, text],
  );
  const sendDisabled = loading || !online || !text.trim();

  return (
    <NewChatFooter
      attachDisabled={loading || !online}
      fill
      inputEditable={!loading}
      loading={loading}
      onAttach={attach}
      onProviderToggle={onProviderToggle}
      onSend={send}
      providerIds={providerIds}
      sendDisabled={sendDisabled}
      setText={setText}
      text={text}
    />
  );
};

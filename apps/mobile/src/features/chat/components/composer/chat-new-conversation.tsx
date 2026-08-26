import { useState } from 'react';

import type { ChatNewConversationProps } from '../../types';
import { NewChatFooter } from './new-chat-footer';

export const ChatNewConversation = ({
  loading,
  onCreate,
  onProviderToggle,
  online,
  providerIds,
}: ChatNewConversationProps) => {
  const [text, setText] = useState('');
  const send = async (): Promise<void> => onCreate(text.trim(), false);
  const attach = async (): Promise<void> => onCreate(text.trim(), true);
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

import { useCallback, useState } from 'react';
import { NewChatFooter } from './new-chat-footer';

type ChatNewConversationProps = Readonly<{
  loading: boolean;
  onCreate: (draft: string, withImage: boolean) => Promise<void>;
  online: boolean;
}>;

export const ChatNewConversation = ({
  loading,
  onCreate,
  online,
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
      onSend={send}
      sendDisabled={sendDisabled}
      setText={setText}
      text={text}
    />
  );
};

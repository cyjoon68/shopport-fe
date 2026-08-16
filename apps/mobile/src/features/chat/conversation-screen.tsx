import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { xhrHttpStream, useChat } from '@tanstack/ai-react';
import { useQuery } from '@apollo/client/react';
import { StyleSheet } from 'react-native-unistyles';
import { ConversationDocument } from '@/graphql/generated/graphql';
import { getAccessToken } from '@/features/auth/auth-token';
import { useSession } from '@/features/auth/session-provider';
import { environment } from '@/shared/config/environment';
import { sqliteChatPersistence } from '@/shared/storage/database';
import { ChatComposer } from './chat-composer';
import { activeAskUserRequest, mergeMessages, MessageList } from './message-list';
import { cancelRunThenStop } from './chat-http';
import { chatErrorPresentation } from './chat-errors';
import { useOnline } from '@/providers/network-provider';
import { createStableChatMessageId } from './message-id';
import type { CachedProduct } from '@/shared/storage/database';
import type { DisplayMessage } from './message-list';

type ConversationScreenProps = Readonly<{
  conversationId?: string;
  initialSend?: boolean;
  onMessagesChange?: ((messages: ReadonlyArray<DisplayMessage>) => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

export const ConversationScreen = ({
  conversationId,
  initialSend: initialSendProp,
  onMessagesChange,
  onProductSelect,
}: ConversationScreenProps = {}) => {
  const { id: routeId, send: routeSend } = useLocalSearchParams<{
    id?: string;
    send?: string;
  }>();
  const id = conversationId ?? (typeof routeId === 'string' ? routeId : '');
  const initialSend = initialSendProp ?? routeSend === '1';
  const { status } = useSession();
  const online = useOnline();
  const assetId = useRef<string | null>(null);
  const connection = useMemo(
    () =>
      xhrHttpStream(`${environment.apiUrl}/v1/ai/chat`, () => {
        const token = getAccessToken();
        return {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: { assetId: assetId.current },
          reconnect: { delayMs: 300, maxAttempts: 5 },
        };
      }),
    [],
  );
  const { data, loading: historyLoading } = useQuery(ConversationDocument, {
    variables: { id },
    skip: !id || !online,
    fetchPolicy: 'cache-and-network',
  });
  const chat = useChat({
    connection,
    threadId: id,
    persistence: sqliteChatPersistence,
    queue: 'drop',
  });

  const historicalMessages = data?.conversation?.messages;
  const displayMessages = useMemo(
    () => mergeMessages(historicalMessages ?? [], chat.messages),
    [chat.messages, historicalMessages],
  );
  const activeAskUser = activeAskUserRequest(displayMessages);

  useEffect(() => {
    onMessagesChange?.(displayMessages);
  }, [displayMessages, onMessagesChange]);

  const errorPresentation = chat.error ? chatErrorPresentation(chat.error) : null;

  useEffect(() => {
    if (errorPresentation?.route) router.push(errorPresentation.route);
  }, [errorPresentation?.route]);

  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;

  const send = async (text: string, nextAssetId: string | null): Promise<void> => {
    assetId.current = nextAssetId;
    try {
      await chat.sendMessage({
        id: createStableChatMessageId(),
        content: text || '이 이미지와 관련된 상품을 찾아줘',
      });
    } finally {
      assetId.current = null;
    }
  };

  const stop = async (): Promise<void> => {
    if (!chat.runId) {
      chat.stop();
      return;
    }
    try {
      await cancelRunThenStop(id, chat.runId, chat.stop);
    } catch (error) {
      Alert.alert(
        '응답 중지 실패',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    }
  };

  return (
    <View style={styles.root} testID="conversation-screen">
      {historyLoading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="대화 불러오는 중" />
        </View>
      ) : (
        <MessageList
          answerDisabled={chat.isLoading}
          messages={displayMessages}
          onAnswer={(label) => send(label, null)}
          onProductSelect={onProductSelect}
        />
      )}
      {errorPresentation ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
          {errorPresentation.message}
        </Text>
      ) : null}
      <ChatComposer
        allowFreeText={activeAskUser?.request.allowFreeText ?? true}
        key={id}
        conversationId={id}
        loading={chat.isLoading}
        onSend={send}
        onStop={stop}
        sendInitialDraft={initialSend}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  error: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.danger,
    fontSize: 13,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
}));

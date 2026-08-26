import { useApolloClient, useQuery } from '@apollo/client/react';
import { type UIMessage, useChat, xhrHttpStream } from '@tanstack/ai-react';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { getAccessToken } from '@/features/auth/auth-token';
import { useSession } from '@/features/auth/session-provider';
import { ConversationDocument, ConversationsDocument } from '@/graphql/generated/graphql';
import { useOnline } from '@/providers/network-provider';
import { environment } from '@/shared/config/environment';
import type { CachedProduct } from '@/shared/storage/database';
import { flushChatPersistence, sqliteChatPersistence } from '@/shared/storage/database';

import { ASK_USER_SKIP_MESSAGE } from './ask-user';
import { AskUserSheet } from './ask-user-sheet';
import { ChatComposer } from './chat-composer';
import type { RetailerId } from './chat-composer-types';
import { chatErrorPresentation } from './chat-errors';
import { cancelRunThenStop } from './chat-http';
import { createStableChatMessageId } from './message-id';
import { MessageList } from './message-list';
import type { DisplayMessage, DisplayMessageMergeCache } from './message-model';
import {
  activeAskUserRequest,
  fromHistoricalMessage,
  fromLiveMessage,
  mergeDisplayMessages,
} from './message-model';

type ConversationScreenProps = Readonly<{
  conversationId?: string;
  initialSend?: boolean;
  onProviderReset?: (() => void) | undefined;
  onProviderToggle?: ((providerId: RetailerId) => void) | undefined;
  onMessagesChange?: ((messages: ReadonlyArray<DisplayMessage>) => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
  providerIds?: ReadonlyArray<RetailerId> | undefined;
}>;

export const ConversationScreen = ({
  conversationId,
  initialSend: initialSendProp,
  onMessagesChange,
  onProductSelect,
  onProviderReset,
  onProviderToggle,
  providerIds = [],
}: ConversationScreenProps = {}) => {
  const { id: routeId, send: routeSend } = useLocalSearchParams<{
    id?: string;
    send?: string;
  }>();
  const id = conversationId ?? (typeof routeId === 'string' ? routeId : '');
  const initialSend = initialSendProp ?? routeSend === '1';
  const { status } = useSession();
  const online = useOnline();
  const client = useApolloClient();
  const assetId = useRef<string | null>(null);
  const providerIdsRef = useRef<ReadonlyArray<RetailerId> | undefined>(undefined);
  const responseFinishedRef = useRef(false);
  const liveDisplayCacheRef = useRef(
    new Map<string, Readonly<{ message: UIMessage; display: DisplayMessage }>>(),
  );
  const displayMessageMergeCacheRef = useRef<DisplayMessageMergeCache>(new Map());
  const connection = useMemo(
    () =>
      xhrHttpStream(`${environment.apiUrl}/v1/ai/chat`, () => {
        const token = getAccessToken();
        return {
          headers: token ? { authorization: `Bearer ${token}` } : {},
          body: {
            assetId: assetId.current,
            ...(providerIdsRef.current === undefined
              ? {}
              : { providerIds: providerIdsRef.current }),
          },
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
    onFinish: () => {
      responseFinishedRef.current = true;
      void flushChatPersistence(id).catch(() => undefined);
      void client.refetchQueries({ include: [ConversationsDocument] });
    },
    threadId: id,
    persistence: sqliteChatPersistence,
    queue: 'drop',
  });

  const historicalMessages = data?.conversation?.messages;
  const historicalDisplayMessages = useMemo(
    () => (historicalMessages ?? []).map(fromHistoricalMessage),
    [historicalMessages],
  );
  const liveDisplayMessages = useMemo(() => {
    const previous = liveDisplayCacheRef.current;
    const next = new Map<
      string,
      Readonly<{ message: UIMessage; display: DisplayMessage }>
    >();
    const messages = chat.messages.map((message) => {
      const cached = previous.get(message.id);
      const display =
        cached?.message === message ? cached.display : fromLiveMessage(message);
      next.set(message.id, { message, display });
      return display;
    });
    liveDisplayCacheRef.current = next;
    return messages;
  }, [chat.messages]);
  const displayMessages = useMemo(
    () =>
      mergeDisplayMessages(
        historicalDisplayMessages,
        liveDisplayMessages,
        displayMessageMergeCacheRef.current,
      ),
    [historicalDisplayMessages, liveDisplayMessages],
  );
  const activeAskUser = activeAskUserRequest(displayMessages);
  const [askSheetOpen, setAskSheetOpen] = useState(false);
  const askSheetIdRef = useRef<string | null>(null);
  const skipAskUserRef = useRef(false);
  const conversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (conversationIdRef.current !== id) {
      conversationIdRef.current = id;
      askSheetIdRef.current = null;
      skipAskUserRef.current = false;
    }
    const activeAskUserId = activeAskUser?.id ?? null;
    if (!activeAskUserId) {
      askSheetIdRef.current = null;
      skipAskUserRef.current = false;
      setAskSheetOpen(false);
      return;
    }
    if (askSheetIdRef.current !== activeAskUserId) {
      askSheetIdRef.current = activeAskUserId;
      if (!skipAskUserRef.current) setAskSheetOpen(true);
    }
  }, [activeAskUser?.id, id]);

  useEffect(() => {
    onMessagesChange?.(displayMessages);
  }, [displayMessages, onMessagesChange]);

  useEffect(
    () => () => {
      void flushChatPersistence(id).catch(() => undefined);
    },
    [id],
  );

  const errorPresentation = chat.error ? chatErrorPresentation(chat.error) : null;

  useEffect(() => {
    if (errorPresentation?.route) router.push(errorPresentation.route);
  }, [errorPresentation?.route]);

  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;

  const send = async (text: string, nextAssetId: string | null): Promise<void> => {
    assetId.current = nextAssetId;
    providerIdsRef.current = activeAskUser ? undefined : providerIds;
    responseFinishedRef.current = false;
    try {
      await chat.sendMessage({
        id: createStableChatMessageId(),
        content: text || '이 이미지와 관련된 상품을 찾아줘',
      });
      if (responseFinishedRef.current) onProviderReset?.();
    } finally {
      assetId.current = null;
      providerIdsRef.current = undefined;
    }
  };

  const answerAskUser = async (label: string): Promise<void> => {
    setAskSheetOpen(false);
    try {
      await send(label, null);
    } catch (error) {
      setAskSheetOpen(true);
      throw error;
    }
  };

  const skipAskUser = async (): Promise<void> => {
    if (skipAskUserRef.current) return;
    skipAskUserRef.current = true;
    setAskSheetOpen(false);
    try {
      await chat.sendMessage(
        { id: createStableChatMessageId(), content: ASK_USER_SKIP_MESSAGE },
        { whenBusy: 'queue' },
      );
    } catch (error) {
      skipAskUserRef.current = false;
      setAskSheetOpen(true);
      Alert.alert('질문을 건너뛰지 못했어요', chatErrorPresentation(error).message);
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
          isGenerating={chat.isLoading}
          messages={displayMessages}
          onAskUserPress={() => {
            if (!skipAskUserRef.current) setAskSheetOpen(true);
          }}
          onProductSelect={onProductSelect}
        />
      )}
      {errorPresentation ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
          {errorPresentation.message}
        </Text>
      ) : null}
      {activeAskUser ? (
        <AskUserSheet
          loading={chat.isLoading}
          onDismiss={skipAskUser}
          onSelect={answerAskUser}
          request={activeAskUser.request}
          visible={askSheetOpen}
        />
      ) : null}
      <ChatComposer
        allowFreeText={activeAskUser?.request.allowFreeText ?? true}
        key={id}
        conversationId={id}
        loading={chat.isLoading}
        onProviderToggle={onProviderToggle}
        onSend={send}
        onStop={stop}
        providerIds={providerIds}
        quickActionsEnabled={
          !historyLoading && !activeAskUser && displayMessages.length === 0
        }
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

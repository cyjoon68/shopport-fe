import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { type MutableRefObject, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import {
  activeAskUserRequest,
  ASK_USER_SKIP_MESSAGE,
  AskUserSheet,
  cancelRunThenStop,
  ChatComposer,
  chatErrorPresentation,
  createStableChatMessageId,
  fromHistoricalMessage,
  fromLiveMessage,
  mergeDisplayMessages,
  MessageList,
  type RetailerId,
} from '@/features/chat';
import { useChatRun, useConversationHistory } from '@/features/chat/api/hooks';
import { NetworkBoundary, useOnline } from '@/providers/network-provider';

import type { ConversationScreenProps, ConversationScreenRouteParams } from './types';

export const ConversationScreen = ({
  conversationId,
  initialSend: initialSendProp,
  onMessagesChange,
  onProductSelect,
  onProviderReset,
  onProviderToggle,
  providerIds = [],
  remoteWorkRef: parentRemoteWorkRef,
}: ConversationScreenProps = {}) => {
  const { id: routeId, send: routeSend } =
    useLocalSearchParams<ConversationScreenRouteParams>();
  const id = conversationId ?? (typeof routeId === 'string' ? routeId : '');
  const initialSend = initialSendProp ?? routeSend === '1';
  const { status } = useSession();
  const networkOnline = useOnline();
  const localRemoteWorkRef = useRef(false);
  const remoteWorkRef = parentRemoteWorkRef ?? localRemoteWorkRef;
  const online = status === 'authenticated' && networkOnline;
  remoteWorkRef.current = online;

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;

  return (
    <ConversationContent
      conversationId={id}
      initialSend={initialSend}
      onMessagesChange={onMessagesChange}
      onProductSelect={onProductSelect}
      onProviderReset={onProviderReset}
      onProviderToggle={onProviderToggle}
      online={online}
      providerIds={providerIds}
      remoteWorkRef={remoteWorkRef}
    />
  );
};

const ConversationContent = ({
  conversationId: id,
  initialSend,
  onMessagesChange,
  onProductSelect,
  onProviderReset,
  onProviderToggle,
  online,
  providerIds,
  remoteWorkRef,
}: Omit<ConversationScreenProps, 'conversationId' | 'initialSend'> &
  Readonly<{
    conversationId: string;
    initialSend: boolean;
    online: boolean;
    remoteWorkRef: MutableRefObject<boolean>;
  }>) => {
  const assetId = useRef<string | null>(null);
  const providerIdsRef = useRef<ReadonlyArray<RetailerId> | undefined>(undefined);
  const responseFinishedRef = useRef(false);
  const { data, loading: historyLoading } = useConversationHistory(id, online);
  const {
    error: chatError,
    isLoading,
    messages: liveMessages,
    runId,
    sendMessage,
    stop: stopChat,
  } = useChatRun({
    assetId,
    conversationId: id,
    online,
    onFinish: () => {
      responseFinishedRef.current = true;
    },
    providerIds: providerIdsRef,
    remoteWorkRef,
  });

  const historicalMessages = data?.conversation?.messages;
  const historicalDisplayMessages = (historicalMessages ?? []).map(fromHistoricalMessage);
  const liveDisplayMessages = liveMessages.map(fromLiveMessage);
  const displayMessages = mergeDisplayMessages(
    historicalDisplayMessages,
    liveDisplayMessages,
  );
  const activeAskUser = activeAskUserRequest(displayMessages);
  const [askSheetOpen, setAskSheetOpen] = useState(false);
  const [draftReplacement, setDraftReplacement] = useState<Readonly<{
    text: string;
  }> | null>(null);
  const editRequestIdRef = useRef(0);
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

  const errorPresentation = chatError ? chatErrorPresentation(chatError) : null;

  useEffect(() => {
    if (errorPresentation?.route) router.push(errorPresentation.route);
  }, [errorPresentation?.route]);

  const send = async (text: string, nextAssetId: string | null): Promise<void> => {
    assetId.current = nextAssetId;
    providerIdsRef.current = activeAskUser ? undefined : providerIds;
    responseFinishedRef.current = false;
    try {
      await sendMessage({
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
      await sendMessage(
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
    if (!runId) {
      stopChat();
      return;
    }
    try {
      await cancelRunThenStop(id, runId, stopChat);
    } catch (error) {
      Alert.alert(
        '응답 중지 실패',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
    }
  };

  const editMessage = async (text: string): Promise<void> => {
    const requestId = ++editRequestIdRef.current;
    if (isLoading) await stop();
    if (requestId !== editRequestIdRef.current) return;
    setDraftReplacement({ text });
  };

  return (
    <View style={styles.root} testID="conversation-screen">
      {historyLoading && !data ? (
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="대화 불러오는 중" />
        </View>
      ) : (
        <MessageList
          isGenerating={isLoading}
          messages={displayMessages}
          onAskUserPress={() => {
            if (!skipAskUserRef.current) setAskSheetOpen(true);
          }}
          onEditMessage={editMessage}
          onProductSelect={onProductSelect}
        />
      )}
      {errorPresentation ? (
        <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
          {errorPresentation.message}
        </Text>
      ) : null}
      {online && activeAskUser ? (
        <AskUserSheet
          loading={isLoading}
          onDismiss={skipAskUser}
          onSelect={answerAskUser}
          request={activeAskUser.request}
          visible={askSheetOpen}
        />
      ) : null}
      <NetworkBoundary online={online}>
        <ChatComposer
          allowFreeText={activeAskUser?.request.allowFreeText ?? true}
          key={id}
          conversationId={id}
          draftReplacement={draftReplacement}
          loading={isLoading}
          onProviderToggle={onProviderToggle}
          onSend={send}
          onStop={stop}
          providerIds={providerIds}
          quickActionsEnabled={
            !historyLoading && !activeAskUser && displayMessages.length === 0
          }
          remoteWorkRef={remoteWorkRef}
          sendInitialDraft={initialSend}
        />
      </NetworkBoundary>
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

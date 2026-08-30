import { Redirect, router, useLocalSearchParams } from 'expo-router';
import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
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
  type ChatRunContext,
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

type ActiveRunContext = Readonly<
  Omit<ChatRunContext, 'runId'> & { runId: string | null }
>;

type StoppedRecovery = Readonly<
  Omit<ActiveRunContext, 'runId'> & {
    message: string;
    question: string;
    reason: 'cancelled' | 'failed';
  }
>;

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
  const previousOnlineRef = useRef(online);
  const mountedConversationRef = useRef<string | null>(null);
  const [reconnectGeneration, setReconnectGeneration] = useState(0);
  const mounted = status !== 'booting' && status !== 'guest' && Boolean(id);
  const reconnecting =
    mounted &&
    mountedConversationRef.current === id &&
    online &&
    !previousOnlineRef.current;
  const [stoppedRecovery, setStoppedRecovery] = useState<StoppedRecovery | null>(null);
  const [activeRunContext, setActiveRunContext] = useState<ActiveRunContext | null>(null);
  const cancelledRunIdsRef = useRef(new Set<string>());
  remoteWorkRef.current = online && !reconnecting;

  useEffect(() => {
    if (!mounted) {
      mountedConversationRef.current = null;
      previousOnlineRef.current = online;
      return;
    }
    if (mountedConversationRef.current && mountedConversationRef.current !== id) {
      setActiveRunContext(null);
      setStoppedRecovery(null);
    }
    if (mountedConversationRef.current === id && online && !previousOnlineRef.current)
      setReconnectGeneration((generation) => generation + 1);
    mountedConversationRef.current = id;
    previousOnlineRef.current = online;
  }, [id, online, status]);

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;

  return (
    <ConversationContent
      conversationId={id}
      initialSend={initialSend}
      key={`${id}:${reconnectGeneration}`}
      onMessagesChange={onMessagesChange}
      onProductSelect={onProductSelect}
      onProviderReset={onProviderReset}
      onProviderToggle={onProviderToggle}
      online={online}
      providerIds={providerIds}
      remoteWorkRef={remoteWorkRef}
      activeRunContext={activeRunContext}
      cancelledRunIdsRef={cancelledRunIdsRef}
      setActiveRunContext={setActiveRunContext}
      setStoppedRecovery={setStoppedRecovery}
      stoppedRecovery={stoppedRecovery}
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
  activeRunContext,
  cancelledRunIdsRef,
  setActiveRunContext,
  setStoppedRecovery,
  stoppedRecovery,
}: Omit<ConversationScreenProps, 'conversationId' | 'initialSend'> &
  Readonly<{
    conversationId: string;
    initialSend: boolean;
    online: boolean;
    remoteWorkRef: MutableRefObject<boolean>;
    activeRunContext: ActiveRunContext | null;
    cancelledRunIdsRef: MutableRefObject<Set<string>>;
    setActiveRunContext: Dispatch<SetStateAction<ActiveRunContext | null>>;
    setStoppedRecovery: Dispatch<SetStateAction<StoppedRecovery | null>>;
    stoppedRecovery: StoppedRecovery | null;
  }>) => {
  const assetId = useRef<string | null>(null);
  const providerIdsRef = useRef<ReadonlyArray<RetailerId> | undefined>(undefined);
  const responseFinishedRef = useRef(false);
  const activeRunContextRef = useRef<ChatRunContext | null>(null);
  const activeRunIdRef = useRef<string | null>(null);
  const finishedRunIdRef = useRef<string | null>(null);
  const renderedRunIdRef = useRef<string | null>(null);
  const persistedActiveRunContext =
    activeRunContext?.conversationId === id ? activeRunContext : null;
  const {
    data,
    loading: historyLoading,
    refetch: refetchHistory,
  } = useConversationHistory(id, online);
  const {
    error: chatError,
    isLoading,
    messages: liveMessages,
    reload,
    runId,
    sendMessage,
    stop: stopChat,
    clearPersistedResume,
  } = useChatRun({
    assetId,
    cancelledRunIdsRef,
    conversationId: id,
    online,
    onFinish: (finishedRunId) => {
      if (
        finishedRunId &&
        activeRunIdRef.current &&
        finishedRunId !== activeRunIdRef.current
      )
        return;
      responseFinishedRef.current = true;
      activeRunContextRef.current = null;
      assetId.current = null;
      providerIdsRef.current = undefined;
      finishedRunIdRef.current = finishedRunId ?? activeRunIdRef.current;
      setActiveRunContext((current) => {
        if (
          !current ||
          current.conversationId !== id ||
          (finishedRunId && current.runId && current.runId !== finishedRunId)
        )
          return current;
        return null;
      });
      setStoppedRecovery(null);
    },
    onRunStart: (startedRunId) => {
      activeRunIdRef.current = startedRunId;
      finishedRunIdRef.current = null;
      if (activeRunContextRef.current?.conversationId === id)
        activeRunContextRef.current = {
          ...activeRunContextRef.current,
          runId: startedRunId,
        };
      setActiveRunContext((current) =>
        current?.conversationId === id ? { ...current, runId: startedRunId } : current,
      );
    },
    onResumeContext: (context) => {
      if (context.conversationId !== id) return;
      activeRunContextRef.current = context;
      activeRunIdRef.current = context.runId;
      assetId.current = context.assetId;
      providerIdsRef.current = context.providerIds;
      setActiveRunContext(context);
    },
    providerIds: providerIdsRef,
    remoteWorkRef,
    runContextRef: activeRunContextRef,
  });
  if (runId && (activeRunIdRef.current === null || runId !== renderedRunIdRef.current))
    activeRunIdRef.current = runId;
  if (runId) renderedRunIdRef.current = runId;

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
    focus?: number;
    text: string;
  }> | null>(null);
  const [retrying, setRetrying] = useState(false);
  const stoppedQuestionFocusRef = useRef(0);
  const editRequestIdRef = useRef(0);
  const retryInFlightRef = useRef(false);
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
    const context = {
      assetId: nextAssetId,
      providerIds: activeAskUser ? undefined : providerIds,
    };
    setStoppedRecovery(null);
    activeRunContextRef.current = { ...context, conversationId: id, runId: '' };
    setActiveRunContext({ ...context, conversationId: id, runId: null });
    finishedRunIdRef.current = null;
    assetId.current = context.assetId;
    providerIdsRef.current = context.providerIds;
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

  const stop = async (showRecovery = true): Promise<void> => {
    const question = displayMessages.findLast(({ role }) => role === 'user')?.text.trim();
    const context =
      activeRunContextRef.current ??
      (persistedActiveRunContext
        ? {
            assetId: persistedActiveRunContext.assetId,
            providerIds: persistedActiveRunContext.providerIds,
          }
        : {
            assetId: assetId.current,
            providerIds: providerIdsRef.current,
          });
    const recoveryContext = question
      ? { ...context, conversationId: id, question }
      : null;
    const recovery = (reason: StoppedRecovery['reason']): StoppedRecovery | null =>
      recoveryContext
        ? {
            ...recoveryContext,
            message: reason === 'failed' ? '검색에 실패했어요' : '검색을 중지했어요',
            reason,
          }
        : null;
    if (!runId) {
      stopChat();
      activeRunContextRef.current = null;
      setActiveRunContext((current) => (current?.conversationId === id ? null : current));
      if (showRecovery) setStoppedRecovery(recovery('cancelled'));
      return;
    }
    try {
      const outcome = await cancelRunThenStop(id, runId, stopChat);
      if (outcome === 'completed') {
        activeRunContextRef.current = null;
        setActiveRunContext((current) =>
          current?.conversationId === id && (!current.runId || current.runId === runId)
            ? null
            : current,
        );
        void clearPersistedResume(runId).catch(() => undefined);
        try {
          await refetchHistory();
        } catch {
          Alert.alert(
            '응답 상태 확인 실패',
            '완료된 응답을 확인하지 못했어요. 다시 시도해 주세요.',
          );
        }
        return;
      }
      if (outcome === 'failed') {
        activeRunContextRef.current = null;
        setActiveRunContext((current) =>
          current?.conversationId === id && (!current.runId || current.runId === runId)
            ? null
            : current,
        );
        void clearPersistedResume(runId).catch(() => undefined);
        if (showRecovery && finishedRunIdRef.current !== runId)
          setStoppedRecovery(recovery('failed'));
        return;
      }
    } catch (error) {
      Alert.alert(
        '응답 중지 실패',
        error instanceof Error ? error.message : '다시 시도해 주세요.',
      );
      return;
    }
    setActiveRunContext((current) =>
      current?.conversationId === id && (!current.runId || current.runId === runId)
        ? null
        : current,
    );
    activeRunContextRef.current = null;
    void clearPersistedResume(runId).catch(() => undefined);
    if (showRecovery && finishedRunIdRef.current !== runId)
      setStoppedRecovery(recovery('cancelled'));
  };

  const editMessage = async (text: string): Promise<void> => {
    const requestId = ++editRequestIdRef.current;
    if (isLoading) await stop(false);
    if (requestId !== editRequestIdRef.current) return;
    setDraftReplacement({ text });
  };

  const editStoppedQuestion = (): void => {
    if (!stoppedRecovery) return;
    stoppedQuestionFocusRef.current += 1;
    setDraftReplacement({
      focus: stoppedQuestionFocusRef.current,
      text: stoppedRecovery.question,
    });
    setStoppedRecovery(null);
  };

  const retryStoppedQuestion = async (): Promise<void> => {
    if (!stoppedRecovery || retryInFlightRef.current) return;
    retryInFlightRef.current = true;
    const recovery = stoppedRecovery;
    setRetrying(true);
    activeRunContextRef.current = {
      assetId: recovery.assetId,
      conversationId: id,
      providerIds: recovery.providerIds,
      runId: '',
    };
    setActiveRunContext({
      assetId: recovery.assetId,
      conversationId: id,
      providerIds: recovery.providerIds,
      runId: null,
    });
    assetId.current = recovery.assetId;
    providerIdsRef.current = recovery.providerIds;
    finishedRunIdRef.current = null;
    responseFinishedRef.current = false;
    try {
      await reload();
      if (responseFinishedRef.current) onProviderReset?.();
      setStoppedRecovery((current) => (current === recovery ? null : current));
    } catch (error) {
      setActiveRunContext((current) => (current?.conversationId === id ? null : current));
      setStoppedRecovery((current) => (current === recovery ? recovery : current));
      Alert.alert('다시 검색 실패', chatErrorPresentation(error).message);
    } finally {
      assetId.current = null;
      providerIdsRef.current = undefined;
      retryInFlightRef.current = false;
      setRetrying(false);
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
          isGenerating={isLoading}
          messages={displayMessages}
          onAskUserPress={() => {
            if (!skipAskUserRef.current) setAskSheetOpen(true);
          }}
          onEditMessage={editMessage}
          onProductSelect={onProductSelect}
          recovery={
            stoppedRecovery?.conversationId === id
              ? {
                  onEdit: editStoppedQuestion,
                  onRetry: () => void retryStoppedQuestion(),
                  message: stoppedRecovery.message,
                  question: stoppedRecovery.question,
                  reason: stoppedRecovery.reason,
                  retrying,
                }
              : undefined
          }
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

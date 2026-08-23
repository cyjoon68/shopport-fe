import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { xhrHttpStream, useChat } from '@tanstack/ai-react';
import { useQuery } from '@apollo/client/react';
import { StyleSheet } from 'react-native-unistyles';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ConversationDocument } from '@/graphql/generated/graphql';
import { getAccessToken } from '@/features/auth/auth-token';
import { useSession } from '@/features/auth/session-provider';
import { environment } from '@/shared/config/environment';
import { sqliteChatPersistence } from '@/shared/storage/database';
import { ChatComposer } from './chat-composer';
import { activeAskUserRequest, mergeMessages, MessageList } from './message-list';
import { cancelRunThenStop } from './chat-http';
import { chatErrorPresentation } from './chat-errors';
import { ASK_USER_SKIP_MESSAGE } from './ask-user';
import { useOnline } from '@/providers/network-provider';
import { createStableChatMessageId } from './message-id';
import { AskUserCard } from './ask-user-card';
import type { RetailerId } from './chat-composer-types';
import type { CachedProduct } from '@/shared/storage/database';
import type { DisplayMessage } from './message-list';

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
  const assetId = useRef<string | null>(null);
  const providerIdsRef = useRef<ReadonlyArray<RetailerId> | undefined>(undefined);
  const responseFinishedRef = useRef(false);
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
    },
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
        <Modal
          animationType="slide"
          onRequestClose={() => void skipAskUser()}
          presentationStyle="overFullScreen"
          transparent
          visible={askSheetOpen}
        >
          <View style={styles.sheetRoot}>
            <Pressable
              accessible={false}
              importantForAccessibility="no"
              onPress={() => void skipAskUser()}
              style={styles.sheetBackdrop}
            />
            <SafeAreaView
              accessibilityViewIsModal
              edges={['bottom']}
              style={styles.sheet}
              testID="ask-user-sheet"
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text
                  allowFontScaling
                  maxFontSizeMultiplier={2.5}
                  style={styles.sheetTitle}
                >
                  Shopport의 추가 질문
                </Text>
                <Pressable
                  accessibilityLabel="추가 질문 닫기"
                  accessibilityRole="button"
                  onPress={() => void skipAskUser()}
                  style={styles.sheetClose}
                >
                  <Text style={styles.sheetCloseLabel}>닫기</Text>
                </Pressable>
              </View>
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={styles.sheetScroll}
              >
                <AskUserCard
                  disabled={chat.isLoading}
                  disabledMessage={chat.isLoading ? '답변을 보내는 중이에요' : undefined}
                  onSelect={answerAskUser}
                  request={activeAskUser.request}
                />
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
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
  sheetRoot: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.scrim,
  },
  sheet: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderTopLeftRadius: theme.radii.lg,
    borderTopRightRadius: theme.radii.lg,
    borderWidth: 1,
    gap: theme.spacing.md,
    maxHeight: theme.layout.conversationSheet.maxHeight,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
  },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { paddingBottom: theme.spacing.md },
  sheetHandle: {
    alignSelf: 'center',
    backgroundColor: theme.colors.textMuted,
    borderRadius: theme.radii.pill,
    height: theme.spacing.xs,
    width: theme.layout.conversationSheet.handleWidth,
  },
  sheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sheetTitle: {
    color: theme.colors.text,
    fontWeight: '600',
    ...theme.typography.conversation.sheetTitle,
  },
  sheetClose: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.md,
  },
  sheetCloseLabel: {
    color: theme.colors.text,
    ...theme.typography.conversation.sheetAction,
  },
}));

import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useNavigation } from 'expo-router';
import { xhrHttpStream, useChat } from '@tanstack/ai-react';
import { useQuery } from '@apollo/client/react';
import { StyleSheet } from 'react-native-unistyles';
import { Screen } from '@shopport/ui';
import { ConversationDocument } from '@/graphql/generated/graphql';
import { ConversationSummaryFragmentDoc } from '@/graphql/generated/graphql';
import { readFragment } from '@/graphql/generated';
import { getAccessToken } from '@/features/auth/auth-token';
import { useSession } from '@/features/auth/session-provider';
import { environment } from '@/shared/config/environment';
import { sqliteChatPersistence } from '@/shared/storage/database';
import { ChatComposer } from './chat-composer';
import { MessageList } from './message-list';

export const ConversationScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { status } = useSession();
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
    skip: !id,
    fetchPolicy: 'cache-and-network',
  });
  const chat = useChat({
    connection,
    threadId: id,
    persistence: sqliteChatPersistence,
    queue: 'drop',
  });

  const summary = data?.conversation
    ? readFragment(ConversationSummaryFragmentDoc, data.conversation)
    : null;

  useEffect(() => {
    const title = summary?.title;
    if (title) navigation.setOptions({ title });
  }, [navigation, summary?.title]);

  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;

  const send = async (text: string, nextAssetId: string | null): Promise<void> => {
    assetId.current = nextAssetId;
    try {
      await chat.sendMessage(text || '이 이미지와 관련된 상품을 찾아줘');
    } finally {
      assetId.current = null;
    }
  };

  return (
    <Screen testID="conversation-screen">
      <View style={styles.root}>
        {historyLoading && !data ? (
          <View style={styles.loading}>
            <ActivityIndicator accessibilityLabel="대화 불러오는 중" />
          </View>
        ) : (
          <MessageList
            historical={data?.conversation?.messages ?? []}
            messages={chat.messages}
          />
        )}
        {chat.error ? (
          <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
            응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.
          </Text>
        ) : null}
        <ChatComposer conversationId={id} loading={chat.isLoading} onSend={send} />
      </View>
    </Screen>
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

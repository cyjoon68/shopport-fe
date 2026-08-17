import { useEffect, useMemo, useState } from 'react';
import { Alert, Text, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Redirect, router } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useMutation, useQuery } from '@apollo/client/react';
import { EmptyState, Screen } from '@shopport/ui';
import { readFragment } from '@/graphql/generated';
import {
  ConversationSummaryFragmentDoc,
  ConversationsDocument,
  DeleteConversationDocument,
} from '@/graphql/generated/graphql';
import { conversationHref } from '@/features/chat';
import { useSession } from '@/features/auth/session-provider';
import { useOnline } from '@/providers/network-provider';
import {
  cacheConversations,
  deleteCachedConversation,
  deleteDraft,
  readCachedConversations,
  setConversationPinned,
  sqliteChatPersistence,
} from '@/shared/storage/database';
import type { CachedConversation } from '@/shared/storage/database';
import { GlassButton } from '@/shared/ui/glass-button';

export const HistoryScreen = () => {
  const { status } = useSession();
  const online = useOnline();
  const [cached, setCached] = useState<Array<CachedConversation>>([]);
  const [query, setQuery] = useState('');
  const { data, fetchMore, refetch } = useQuery(ConversationsDocument, {
    fetchPolicy: 'cache-and-network',
    skip: status !== 'authenticated' || !online,
  });
  const [deleteConversation] = useMutation(DeleteConversationDocument);
  const conversations = useMemo(
    () =>
      data?.conversations.edges.map(({ node }) => {
        const conversation = readFragment(ConversationSummaryFragmentDoc, node);
        return {
          id: conversation.id,
          title: conversation.title,
          updatedAt: conversation.updatedAt,
        };
      }),
    [data?.conversations.edges],
  );

  useEffect(() => {
    if (conversations?.length) {
      void cacheConversations(conversations);
      setCached(conversations);
      return;
    }
    void readCachedConversations().then(setCached);
  }, [conversations]);

  if (status === 'guest') return <Redirect href="/auth" />;
  const normalizedQuery = query.trim().toLowerCase();
  const visibleConversations = (conversations ?? cached).filter(({ title }) =>
    normalizedQuery ? title.toLowerCase().includes(normalizedQuery) : true,
  );
  const remove = (conversation: CachedConversation): void => {
    if (!online) {
      Alert.alert('오프라인', '대화 삭제는 온라인에서 할 수 있습니다.');
      return;
    }
    Alert.alert('대화를 삭제할까요?', '메시지와 첨부 이미지도 함께 삭제됩니다.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const result = await deleteConversation({
              variables: { input: { id: conversation.id } },
            });
            if (!result.data?.deleteConversation.success) {
              Alert.alert(
                '삭제 실패',
                result.data?.deleteConversation.userErrors[0]?.message ??
                  '다시 시도해 주세요.',
              );
              return;
            }
            const cleanupResults = await Promise.allSettled([
              deleteCachedConversation(conversation.id),
              sqliteChatPersistence.removeItem(conversation.id),
              setConversationPinned(conversation.id, false),
              deleteDraft(conversation.id),
            ]);
            const cacheCleanupFailed = cleanupResults.some(
              ({ status }) => status === 'rejected',
            );
            try {
              await refetch();
            } catch {
              Alert.alert(
                '삭제 완료',
                cacheCleanupFailed
                  ? '서버에서 삭제되었지만 기기 캐시와 목록을 새로 고치지 못했습니다.'
                  : '서버에서 삭제되었지만 목록을 새로 고치지 못했습니다.',
              );
              return;
            }
            if (cacheCleanupFailed) {
              Alert.alert(
                '삭제 완료',
                '서버에서 삭제되었지만 기기 캐시를 정리하지 못했습니다.',
              );
            }
          })();
        },
      },
    ]);
  };

  return (
    <Screen testID="history-screen">
      {!online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인 캐시
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel="대화 기록 검색"
        onChangeText={setQuery}
        placeholder="대화 기록 검색"
        placeholderTextColor={styles.placeholder.color}
        style={styles.search}
        value={query}
      />
      <FlashList
        contentContainerStyle={styles.list}
        data={visibleConversations}
        keyExtractor={({ id }) => id}
        ListEmptyComponent={
          <EmptyState
            description={
              normalizedQuery
                ? '다른 검색어로 다시 찾아보세요.'
                : '새 대화를 시작하면 여기에 저장됩니다.'
            }
            title={normalizedQuery ? '검색 결과가 없습니다' : '대화 기록이 없습니다'}
          />
        }
        onEndReached={() => {
          const pageInfo = data?.conversations.pageInfo;
          if (pageInfo?.hasNextPage) {
            void fetchMore({ variables: { after: pageInfo.endCursor } });
          }
        }}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <GlassButton
              accessibilityHint="대화를 엽니다"
              onPress={() => router.push(conversationHref(item.id))}
              style={styles.rowMain}
            >
              <Text allowFontScaling numberOfLines={2} style={styles.title}>
                {item.title}
              </Text>
              <Text allowFontScaling style={styles.date}>
                {new Intl.DateTimeFormat('ko-KR', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                }).format(new Date(item.updatedAt))}
              </Text>
            </GlassButton>
            <GlassButton
              accessibilityLabel={`${item.title} 삭제`}
              onPress={() => remove(item)}
              style={styles.deleteButton}
            >
              <Text allowFontScaling style={styles.deleteLabel}>
                삭제
              </Text>
            </GlassButton>
          </View>
        )}
      />
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  list: { padding: theme.spacing.lg },
  search: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    color: theme.colors.text,
    fontSize: 16,
    margin: theme.spacing.lg,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
  },
  placeholder: { color: theme.colors.textMuted },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
  row: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 76,
  },
  rowMain: { flex: 1, gap: theme.spacing.xs, justifyContent: 'center', minHeight: 64 },
  title: { color: theme.colors.text, fontSize: 16, fontWeight: '700' },
  date: { color: theme.colors.textMuted, fontSize: 13 },
  deleteButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  deleteLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
}));

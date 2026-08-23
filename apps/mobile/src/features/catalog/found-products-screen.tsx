import { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useQuery } from '@apollo/client/react';
import { EmptyState, Screen } from '@shopport/ui';
import { FoundProductsDocument } from '@/graphql/generated/graphql';
import { useSession } from '@/features/auth/session-provider';
import { useOnline } from '@/providers/network-provider';
import { readCachedChatMessages } from '@/shared/storage/database';
import { ProductCard } from './product-card';
import { productsFromToolResult, recommendedProductFromFragment } from './product-model';
import type { RecommendedProduct } from './product-model';

type ProductPresentation = 'catalog' | 'recommendations';
type ProductScope = 'all-conversations' | 'conversation';

type FoundProductsContentProps = Readonly<{
  conversationRecommendations?: ReadonlyArray<RecommendedProduct>;
  focusProductId?: string | null;
  presentation?: ProductPresentation;
  scope?: ProductScope;
}>;

const RecommendationSummary = ({ aiSummary }: Readonly<{ aiSummary: string }>) => (
  <View style={styles.summaryCard}>
    <Text allowFontScaling style={styles.summaryTitle}>
      AI 요약
    </Text>
    <Text
      allowFontScaling
      maxFontSizeMultiplier={2}
      numberOfLines={3}
      style={styles.summaryBody}
    >
      {aiSummary}
    </Text>
  </View>
);

export const FoundProductsScreen = () => {
  const { status } = useSession();

  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <Screen testID="found-products-screen">
      <FoundProductsContent scope="all-conversations" />
    </Screen>
  );
};

export const FoundProductsContent = ({
  conversationRecommendations = [],
  focusProductId = null,
  presentation = 'catalog',
  scope = 'all-conversations',
}: FoundProductsContentProps = {}) => {
  const { status } = useSession();
  const online = useOnline();
  const includesAllConversations = scope === 'all-conversations';
  const { data, fetchMore } = useQuery(FoundProductsDocument, {
    variables: { first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: !includesAllConversations || status !== 'authenticated' || !online,
  });
  const [cachedRecommendations, setCachedRecommendations] = useState<
    Array<RecommendedProduct>
  >([]);
  useEffect(() => {
    let active = true;
    if (!includesAllConversations) {
      setCachedRecommendations([]);
      return;
    }
    void readCachedChatMessages()
      .then((messages) => {
        if (!active) return;
        setCachedRecommendations(
          messages.flatMap(({ parts }) =>
            parts.flatMap((part) =>
              part.type === 'tool-result'
                ? productsFromToolResult(part.content).map((product) => ({
                    product,
                    aiSummary: null,
                  }))
                : [],
            ),
          ),
        );
      })
      .catch(() => {
        if (active) setCachedRecommendations([]);
      });
    return () => {
      active = false;
    };
  }, [includesAllConversations]);
  const queryRecommendations = useMemo(() => {
    const results =
      data?.conversations.edges.flatMap(({ node }) =>
        node.messages.flatMap(({ parts }) =>
          parts.flatMap((part) =>
            part.__typename === 'ProductReferenceMessagePart'
              ? [recommendedProductFromFragment(part.product, part.aiSummary)]
              : [],
          ),
        ),
      ) ?? [];
    return results;
  }, [data]);
  const recommendations = useMemo(() => {
    const byProductId = new Map<string, RecommendedProduct>();
    const localRecommendations = includesAllConversations
      ? cachedRecommendations
      : conversationRecommendations;
    [...localRecommendations].reverse().forEach((recommendation) => {
      if (!byProductId.has(recommendation.product.id))
        byProductId.set(recommendation.product.id, recommendation);
    });
    queryRecommendations.forEach((recommendation) => {
      if (!byProductId.has(recommendation.product.id))
        byProductId.set(recommendation.product.id, recommendation);
    });
    return [...byProductId.values()];
  }, [
    cachedRecommendations,
    conversationRecommendations,
    includesAllConversations,
    queryRecommendations,
  ]);
  const listRef = useRef<FlashListRef<RecommendedProduct> | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusProductId) return;
    const index = recommendations.findIndex(
      ({ product }) => product.id === focusProductId,
    );
    if (index < 0) return;
    void listRef.current?.scrollToIndex({ index, animated: true });
    setHighlightedProductId(focusProductId);
    const timeout = setTimeout(() => setHighlightedProductId(null), 1_600);
    return () => clearTimeout(timeout);
  }, [focusProductId, recommendations]);

  return (
    <View style={styles.content} testID="found-products-content">
      {includesAllConversations && !online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인에서는 최근 상품을 불러올 수 없습니다.
        </Text>
      ) : null}
      <FlashList
        contentContainerStyle={styles.list}
        data={recommendations}
        keyExtractor={({ product }) => product.id}
        ListEmptyComponent={
          <EmptyState
            description={
              includesAllConversations
                ? '모든 대화에서 찾은 상품이 여기에 모입니다.'
                : '이 대화에서 찾은 상품이 여기에 모입니다.'
            }
            title="찾은 상품이 없습니다"
          />
        }
        onEndReached={() => {
          const pageInfo = data?.conversations.pageInfo;
          if (pageInfo?.hasNextPage)
            void fetchMore({ variables: { after: pageInfo.endCursor, first: 20 } });
        }}
        numColumns={1}
        ref={listRef}
        renderItem={({ item }) => (
          <View style={styles.gridCell}>
            <ProductCard
              compact
              highlighted={item.product.id === highlightedProductId}
              horizontal={presentation === 'recommendations'}
              product={item.product}
            />
            {presentation === 'recommendations' && item.aiSummary ? (
              <RecommendationSummary aiSummary={item.aiSummary} />
            ) : null}
          </View>
        )}
        style={styles.listView}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  content: { flex: 1 },
  gridCell: { flex: 1, gap: theme.spacing.sm, margin: theme.spacing.xs },
  list: { gap: theme.spacing.lg, padding: theme.spacing.lg },
  listView: { flex: 1 },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
  summaryBody: {
    color: theme.colors.text,
    fontSize: theme.typography.productCard.provider.regular,
    lineHeight: theme.typography.productCard.provider.regular * 1.4,
  },
  summaryCard: {
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: theme.typography.productCard.provider.regular,
    fontWeight: '700',
  },
}));

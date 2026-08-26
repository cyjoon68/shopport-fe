import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { EmptyState } from '@shopport/ui';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import { useOnline } from '@/providers/network-provider';
import { readCachedChatMessages } from '@/shared/storage/database';

import { useFoundProductRecommendations } from '../api/hooks';
import { productsFromToolResult } from '../domain/tool-results';
import type { ProductListProps, RecommendedProduct } from '../types';
import { ProductListItem } from './product-list-item';

const recommendationKey = ({ product }: RecommendedProduct): string => product.id;

export const ProductList = ({
  conversationRecommendations = [],
  focusProductId = null,
  presentation = 'catalog',
  scope = 'all-conversations',
}: ProductListProps = {}) => {
  const { status } = useSession();
  const online = useOnline();
  const includesAllConversations = scope === 'all-conversations';
  const { loadMore, recommendations: queryRecommendations } =
    useFoundProductRecommendations(
      includesAllConversations && status === 'authenticated' && online,
    );
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
  const recommendations = [...byProductId.values()];
  const listRef = useRef<FlashListRef<RecommendedProduct> | null>(null);
  const appliedFocusProductIdRef = useRef<string | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusProductId) {
      appliedFocusProductIdRef.current = null;
      return;
    }
    if (appliedFocusProductIdRef.current === focusProductId) return;
    const index = recommendations.findIndex(
      ({ product }) => product.id === focusProductId,
    );
    if (index < 0) return;
    appliedFocusProductIdRef.current = focusProductId;
    void listRef.current?.scrollToIndex({ index, animated: true });
    setHighlightedProductId(focusProductId);
    const timeout = setTimeout(() => setHighlightedProductId(null), 1_600);
    return () => clearTimeout(timeout);
  }, [focusProductId, recommendations]);
  const renderRecommendation = ({ item }: Readonly<{ item: RecommendedProduct }>) => (
    <ProductListItem
      highlighted={item.product.id === highlightedProductId}
      item={item}
      presentation={presentation}
    />
  );

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
        keyExtractor={recommendationKey}
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
        onEndReached={loadMore}
        numColumns={1}
        ref={listRef}
        renderItem={renderRecommendation}
        style={styles.listView}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  content: { flex: 1 },
  list: { gap: theme.spacing.lg, padding: theme.spacing.lg },
  listView: { flex: 1 },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
}));

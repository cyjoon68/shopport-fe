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
import { ProductCard } from './product-card';
import { productFromFragment } from './product-model';
import type { CachedProduct } from '@/shared/storage/database';

type FoundProductsContentProps = Readonly<{
  focusProductId?: string | null;
}>;

export const FoundProductsScreen = () => {
  const { status } = useSession();

  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <Screen testID="found-products-screen">
      <FoundProductsContent />
    </Screen>
  );
};

export const FoundProductsContent = ({
  focusProductId = null,
}: FoundProductsContentProps = {}) => {
  const { status } = useSession();
  const online = useOnline();
  const { data, fetchMore } = useQuery(FoundProductsDocument, {
    variables: { first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: status !== 'authenticated' || !online,
  });
  const products = useMemo(() => {
    const results =
      data?.conversations.edges.flatMap(({ node }) =>
        node.messages.flatMap(({ parts }) =>
          parts.flatMap((part) =>
            part.__typename === 'ProductReferenceMessagePart'
              ? [productFromFragment(part.product)]
              : [],
          ),
        ),
      ) ?? [];
    return [...new Map(results.map((product) => [product.id, product])).values()];
  }, [data]);
  const listRef = useRef<FlashListRef<CachedProduct> | null>(null);
  const [highlightedProductId, setHighlightedProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusProductId) return;
    const index = products.findIndex(({ id }) => id === focusProductId);
    if (index < 0) return;
    void listRef.current?.scrollToIndex({ index, animated: true });
    setHighlightedProductId(focusProductId);
    const timeout = setTimeout(() => setHighlightedProductId(null), 1_600);
    return () => clearTimeout(timeout);
  }, [focusProductId, products]);

  return (
    <View style={styles.content} testID="found-products-content">
      {!online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인에서는 최근 상품을 불러올 수 없습니다.
        </Text>
      ) : null}
      <FlashList
        contentContainerStyle={styles.list}
        data={products}
        keyExtractor={({ id }) => id}
        ListEmptyComponent={
          <EmptyState
            description="대화에서 찾은 상품이 여기에 모입니다."
            title="찾은 상품이 없습니다"
          />
        }
        onEndReached={() => {
          const pageInfo = data?.conversations.pageInfo;
          if (pageInfo?.hasNextPage)
            void fetchMore({ variables: { after: pageInfo.endCursor, first: 20 } });
        }}
        ref={listRef}
        renderItem={({ item }) => (
          <ProductCard highlighted={item.id === highlightedProductId} product={item} />
        )}
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

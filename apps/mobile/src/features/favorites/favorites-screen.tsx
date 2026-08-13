import { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useQuery } from '@apollo/client/react';
import { EmptyState, Screen } from '@shopport/ui';
import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { useSession } from '@/features/auth/session-provider';
import { ProductCard } from '@/features/catalog/product-card';
import { productFromFragment } from '@/features/catalog/product-model';
import { useOnline } from '@/providers/network-provider';
import { cacheProducts, readCachedProducts } from '@/shared/storage/database';
import type { CachedProduct } from '@/shared/storage/database';

export const FavoritesScreen = () => {
  const { status } = useSession();
  const online = useOnline();
  const [cached, setCached] = useState<Array<CachedProduct>>([]);
  const { data, fetchMore } = useQuery(SavedProductsDocument, {
    variables: { first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: status !== 'authenticated' || !online,
  });
  const products = data?.savedProducts.edges.map(({ node }) => productFromFragment(node));
  useEffect(() => {
    if (products?.length) {
      void cacheProducts(products);
      setCached(products);
      return;
    }
    void readCachedProducts().then((items) =>
      setCached(items.filter(({ isSaved }) => isSaved)),
    );
  }, [products]);
  if (status === 'guest') return <Redirect href="/auth" />;
  return (
    <Screen testID="favorites-screen">
      {!online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인 캐시
        </Text>
      ) : null}
      <FlashList
        contentContainerStyle={styles.list}
        data={products ?? cached}
        keyExtractor={({ id }) => id}
        ListEmptyComponent={
          <EmptyState
            description="상품 카드에서 찜을 누르면 저장됩니다."
            title="찜한 상품이 없습니다"
          />
        }
        onEndReached={() => {
          const pageInfo = data?.savedProducts.pageInfo;
          if (pageInfo?.hasNextPage)
            void fetchMore({ variables: { first: 20, after: pageInfo.endCursor } });
        }}
        renderItem={({ item }) => <ProductCard product={item} />}
      />
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  list: { gap: theme.spacing.lg, padding: theme.spacing.lg },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
}));

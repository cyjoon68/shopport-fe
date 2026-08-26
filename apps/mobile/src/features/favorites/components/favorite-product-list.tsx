import { FlashList } from '@shopify/flash-list';
import { EmptyState } from '@shopport/ui';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import { ProductCard } from '@/features/catalog';
import { useOnline } from '@/providers/network-provider';
import type { CachedProduct } from '@/shared/storage/types';

import { useSavedProducts } from '../api/hooks';

const productKey = ({ id }: CachedProduct): string => id;
const renderProduct = ({ item }: Readonly<{ item: CachedProduct }>) => (
  <ProductCard product={item} />
);

export const FavoriteProductList = () => {
  const { status } = useSession();
  const online = useOnline();
  const { loadMore, products } = useSavedProducts(status === 'authenticated' && online);
  return (
    <View style={styles.root} testID="favorite-product-list">
      {!online ? (
        <Text accessibilityLiveRegion="polite" style={styles.offline}>
          오프라인 캐시
        </Text>
      ) : null}
      <FlashList
        contentContainerStyle={styles.list}
        data={products}
        keyExtractor={productKey}
        ListEmptyComponent={
          <EmptyState
            description="상품 카드에서 찜을 누르면 저장됩니다."
            title="찜한 상품이 없습니다"
          />
        }
        onEndReached={loadMore}
        renderItem={renderProduct}
      />
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1 },
  list: { gap: theme.spacing.lg, padding: theme.spacing.lg },
  offline: {
    backgroundColor: theme.colors.surfaceMuted,
    color: theme.colors.textMuted,
    padding: theme.spacing.sm,
    textAlign: 'center',
  },
}));

import { Text, View } from 'react-native';
import { Image } from 'expo-image';
import { StyleSheet } from 'react-native-unistyles';
import type { CachedProduct } from '@/shared/storage/database';
import { GlassButton } from '@/shared/ui/glass-button';
import { formatMoney } from '@/features/catalog/product-model';

export const ChatProductRow = ({
  onProductSelect,
  product,
}: Readonly<{
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
  product: CachedProduct;
}>) => (
  <View accessibilityLabel={`${product.title}, 추천 상품`} style={styles.productRow}>
    <Image
      accessibilityLabel={`${product.title} 상품 이미지`}
      contentFit="cover"
      source={product.imageUrl}
      style={styles.productImage}
    />
    <View style={styles.productInfo}>
      <Text allowFontScaling numberOfLines={2} style={styles.productTitle}>
        {product.title}
      </Text>
      <Text allowFontScaling style={styles.productPrice}>
        {formatMoney(product.totalMinor, product.currency)}
      </Text>
      <GlassButton
        accessibilityLabel={`${product.title} 자세히 보기`}
        onPress={() => onProductSelect?.(product)}
        style={styles.productAction}
      >
        <Text allowFontScaling style={styles.productActionLabel}>
          자세히 보기
        </Text>
      </GlassButton>
    </View>
  </View>
);

const styles = StyleSheet.create((theme) => ({
  productRow: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    maxWidth: '100%',
    padding: theme.spacing.sm,
  },
  productImage: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    height: 84,
    width: 84,
  },
  productInfo: { flex: 1, gap: theme.spacing.xs },
  productTitle: { color: theme.colors.text, fontSize: 15, fontWeight: '600' },
  productPrice: { color: theme.colors.text, fontSize: 16, fontWeight: '800' },
  productAction: {
    alignSelf: 'flex-start',
    borderColor: theme.colors.border,
    borderRadius: theme.radii.sm,
    borderWidth: 1,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
  },
  productActionLabel: { color: theme.colors.text, fontSize: 13, fontWeight: '600' },
}));

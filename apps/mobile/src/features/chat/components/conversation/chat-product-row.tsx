import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { formatMoney } from '@/features/catalog/domain/format-money';
import type { CachedProduct } from '@/shared/storage/types';

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
      <Pressable
        accessibilityLabel={`${product.title} 자세히 보기`}
        accessibilityRole="button"
        onPress={() => onProductSelect?.(product)}
        style={({ pressed }) => [
          styles.productAction,
          pressed && styles.productActionPressed,
        ]}
      >
        <Text allowFontScaling style={styles.productActionLabel}>
          자세히 보기
        </Text>
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create((theme) => ({
  productRow: {
    alignItems: 'stretch',
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    width: 148,
  },
  productImage: {
    backgroundColor: theme.colors.surfaceMuted,
    height: 108,
    width: '100%',
  },
  productInfo: { gap: theme.spacing.xs, padding: theme.spacing.sm },
  productTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 18,
  },
  productPrice: { color: theme.colors.text, fontSize: 15, fontWeight: '800' },
  productAction: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.sm,
    justifyContent: 'center',
    minHeight: theme.interaction.minTouchTarget,
    paddingHorizontal: theme.spacing.sm,
  },
  productActionPressed: { opacity: 0.72 },
  productActionLabel: {
    color: theme.colors.primaryText,
    fontSize: 13,
    fontWeight: '700',
  },
}));

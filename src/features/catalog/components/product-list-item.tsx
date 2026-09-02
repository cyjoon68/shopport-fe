import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { ProductListItemProps } from '../types';
import { ProductCard } from './product-card';

export const ProductListItem = ({
  highlighted,
  item,
  presentation,
}: ProductListItemProps) => (
  <View style={styles.gridCell}>
    <ProductCard
      compact
      highlighted={highlighted}
      horizontal={presentation === 'recommendations'}
      product={item.product}
    />
    {presentation === 'recommendations' && item.aiSummary ? (
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
          {item.aiSummary}
        </Text>
      </View>
    ) : null}
  </View>
);

const styles = StyleSheet.create((theme) => ({
  gridCell: { flex: 1, gap: theme.spacing.sm, margin: theme.spacing.xs },
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

import { Pressable, ScrollView, Text, View } from 'react-native';
import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { EmptyState, Screen } from '@shopport/ui';
import { useSession } from '@/features/auth/session-provider';
import { useCompare } from './compare-provider';
import { formatMoney } from './product-model';

export const CompareScreen = () => {
  const { status } = useSession();
  const { clear, products, remove } = useCompare();
  if (status === 'guest') return <Redirect href="/auth" />;
  if (!products.length) {
    return (
      <Screen testID="compare-screen">
        <EmptyState
          description="상품 카드의 비교 버튼으로 최대 4개를 추가하세요."
          title="비교할 상품이 없습니다"
        />
      </Screen>
    );
  }
  return (
    <Screen testID="compare-screen">
      <View style={styles.toolbar}>
        <Text allowFontScaling style={styles.count}>
          {products.length}/4개 비교
        </Text>
        <Pressable accessibilityRole="button" onPress={clear} style={styles.clearButton}>
          <Text allowFontScaling style={styles.clearLabel}>
            모두 지우기
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={styles.table}>
          {products.map((product) => (
            <View
              accessibilityLabel={`${product.title} 비교 열`}
              key={product.id}
              style={styles.column}
            >
              <Text allowFontScaling numberOfLines={3} style={styles.title}>
                {product.title}
              </Text>
              <Text allowFontScaling style={styles.provider}>
                {product.providerName}
              </Text>
              <Text allowFontScaling style={styles.price}>
                {formatMoney(product.totalMinor, product.currency)}
              </Text>
              <Text allowFontScaling style={styles.cell}>
                배송비 {formatMoney(product.shippingMinor, product.currency)}
              </Text>
              <Text allowFontScaling style={styles.cell}>
                {product.isInStock ? '재고 있음' : '품절'}
              </Text>
              <Text allowFontScaling style={styles.cell}>
                {product.deliveryExpectedAt
                  ? `${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(product.deliveryExpectedAt))} 도착 예정`
                  : '배송일 미정'}
              </Text>
              <Text allowFontScaling style={styles.cell}>
                {product.isAffiliate ? '제휴 링크' : '일반 링크'}
              </Text>
              <Pressable
                accessibilityLabel={`${product.title} 비교에서 제거`}
                accessibilityRole="button"
                onPress={() => remove(product.id)}
                style={styles.removeButton}
              >
                <Text allowFontScaling style={styles.removeLabel}>
                  비교에서 제거
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  toolbar: {
    alignItems: 'center',
    borderBottomColor: theme.colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: theme.spacing.lg,
  },
  count: { color: theme.colors.text, fontSize: 15, fontWeight: '700' },
  clearButton: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  clearLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
  table: { flexDirection: 'row', padding: theme.spacing.lg },
  column: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    gap: theme.spacing.md,
    minHeight: 420,
    padding: theme.spacing.lg,
    width: 240,
  },
  title: { color: theme.colors.text, fontSize: 18, fontWeight: '800', minHeight: 70 },
  provider: { color: theme.colors.textMuted, fontSize: 14 },
  price: { color: theme.colors.primary, fontSize: 21, fontWeight: '900' },
  cell: {
    borderTopColor: theme.colors.border,
    borderTopWidth: 1,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
    paddingTop: theme.spacing.md,
  },
  removeButton: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    marginTop: 'auto',
    minHeight: 44,
  },
  removeLabel: { color: theme.colors.danger, fontSize: 14, fontWeight: '700' },
}));

import { Alert, Linking, ScrollView, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useQuery } from '@apollo/client/react';
import { ActionButton, EmptyState, Screen, SectionTitle } from '@shopport/ui';
import { ProductDocument } from '@/graphql/generated/graphql';
import { useSession } from '@/features/auth/session-provider';
import { ProductCard } from './product-card';
import { formatMoney, productFromFragment } from './product-model';

export const ProductDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { status } = useSession();
  const { data, loading } = useQuery(ProductDocument, { variables: { id }, skip: !id });
  if (status === 'guest') return <Redirect href="/auth" />;
  if (!id) return <Redirect href="/" />;
  if (!data?.product) {
    return (
      <Screen>
        {loading ? (
          <Text style={styles.status}>상품을 불러오는 중입니다</Text>
        ) : (
          <EmptyState
            description="상품 정보가 만료되었거나 제공되지 않습니다."
            title="상품을 찾을 수 없습니다"
          />
        )}
      </Screen>
    );
  }
  const product = productFromFragment(data.product);
  const open = async (): Promise<void> => {
    const url = new URL(product.outboundUrl);
    if (url.protocol !== 'https:') {
      Alert.alert('안전하지 않은 링크', '구매 링크를 열 수 없습니다.');
      return;
    }
    await Linking.openURL(url.toString());
  };
  return (
    <Screen testID="product-detail-screen">
      <ScrollView contentContainerStyle={styles.root}>
        <ProductCard product={product} />
        <View style={styles.details}>
          <SectionTitle>구매 정보</SectionTitle>
          <Text allowFontScaling style={styles.line}>
            상품가 {formatMoney(product.amountMinor, product.currency)}
          </Text>
          <Text allowFontScaling style={styles.line}>
            배송비 {formatMoney(product.shippingMinor, product.currency)}
          </Text>
          <Text allowFontScaling style={styles.total}>
            총액 {formatMoney(product.totalMinor, product.currency)}
          </Text>
          <Text allowFontScaling style={styles.disclosure}>
            {product.isAffiliate
              ? '이 링크를 통한 구매 시 Shopport가 수수료를 받을 수 있습니다.'
              : '제휴 수수료가 없는 링크입니다.'}
          </Text>
        </View>
        <ActionButton disabled={!product.isInStock} onPress={() => void open()}>
          {product.isInStock ? `${product.providerName}에서 구매하기` : '현재 품절'}
        </ActionButton>
      </ScrollView>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { gap: theme.spacing.xl, padding: theme.spacing.lg },
  status: {
    color: theme.colors.textMuted,
    fontSize: 16,
    padding: theme.spacing.xl,
    textAlign: 'center',
  },
  details: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    padding: theme.spacing.lg,
  },
  line: { color: theme.colors.textMuted, fontSize: 16 },
  total: { color: theme.colors.text, fontSize: 20, fontWeight: '800' },
  disclosure: {
    color: theme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: theme.spacing.sm,
  },
}));

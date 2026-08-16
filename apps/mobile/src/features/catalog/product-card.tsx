import { useState } from 'react';
import { Alert, Linking, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { useMutation } from '@apollo/client/react';
import { SaveProductDocument, UnsaveProductDocument } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/database';
import { cacheProducts } from '@/shared/storage/database';
import { useOnline } from '@/providers/network-provider';
import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';
import { GlassButton } from '@/shared/ui/glass-button';
import { useCompare } from './compare-provider';
import { formatMoney } from './product-model';

type ProductCardProps = Readonly<{
  compact?: boolean;
  highlighted?: boolean;
  product: CachedProduct;
}>;

export const ProductCard = ({
  compact = false,
  highlighted = false,
  product,
}: ProductCardProps) => {
  const [saved, setSaved] = useState(product.isSaved);
  const [saveProduct] = useMutation(SaveProductDocument);
  const [unsaveProduct] = useMutation(UnsaveProductDocument);
  const { add } = useCompare();
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  styles.useVariants({ compact, highlighted });

  const toggleSaved = async (): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '온라인에서 찜을 변경할 수 있습니다.');
      return;
    }
    const next = !saved;
    if (next) {
      const result = await saveProduct({
        variables: { input: { productId: product.id } },
      });
      if (result.data?.saveProduct.userErrors.length) {
        Alert.alert(
          '찜 변경 실패',
          result.data.saveProduct.userErrors[0]?.message ?? '다시 시도해 주세요.',
        );
        return;
      }
    } else {
      const result = await unsaveProduct({
        variables: { input: { productId: product.id } },
      });
      if (result.data?.unsaveProduct.userErrors.length) {
        Alert.alert(
          '찜 변경 실패',
          result.data.unsaveProduct.userErrors[0]?.message ?? '다시 시도해 주세요.',
        );
        return;
      }
    }
    setSaved(next);
    await cacheProducts([{ ...product, isSaved: next }]);
    await Haptics.selectionAsync();
  };

  const addToCompare = (): void => {
    const result = add({ ...product, isSaved: saved });
    if (result === 'full') {
      Alert.alert(
        '비교는 최대 4개',
        '비교 화면에서 상품을 제거한 뒤 다시 선택해 주세요.',
      );
      return;
    }
    if (result === 'duplicate') {
      router.push('/compare');
      return;
    }
    void Haptics.selectionAsync();
    router.push('/compare');
  };

  const open = async (): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '구매 링크는 온라인에서 열 수 있습니다.');
      return;
    }
    const url = new URL(product.outboundUrl);
    if (url.protocol !== 'https:') {
      Alert.alert('안전하지 않은 링크', '구매 링크를 열 수 없습니다.');
      return;
    }
    await Linking.openURL(url.toString());
  };

  return (
    <View
      accessibilityLabel={`${product.title}, ${formatMoney(product.totalMinor, product.currency)}`}
      style={styles.card}
    >
      <GlassButton
        accessibilityHint="구매 링크를 엽니다"
        accessibilityLabel={`${product.title} 구매 링크`}
        onPress={() => void open()}
      >
        <Image
          accessibilityLabel={`${product.title} 상품 이미지`}
          contentFit="cover"
          source={product.imageUrl}
          style={styles.image}
          transition={reducedMotion ? 0 : 150}
        />
      </GlassButton>
      <View style={styles.body}>
        <Text
          allowFontScaling
          maxFontSizeMultiplier={2}
          numberOfLines={compact ? 2 : 3}
          style={styles.title}
        >
          {product.title}
        </Text>
        <Text allowFontScaling style={styles.provider}>
          {product.providerName}
          {product.isAffiliate ? ' · 제휴 링크' : ''}
        </Text>
        <Text allowFontScaling style={styles.price}>
          {formatMoney(product.totalMinor, product.currency)}
        </Text>
        <Text allowFontScaling style={product.isInStock ? styles.stock : styles.soldOut}>
          {product.isInStock ? '구매 가능' : '품절'}
        </Text>
        <View style={styles.actions}>
          <GlassButton
            fallbackStyle={styles.smallButtonFallback}
            onPress={() => void toggleSaved()}
            style={styles.smallButton}
          >
            <Text allowFontScaling style={styles.smallButtonLabel}>
              {saved ? '찜 해제' : '찜'}
            </Text>
          </GlassButton>
          <GlassButton
            fallbackStyle={styles.smallButtonFallback}
            onPress={addToCompare}
            style={styles.smallButton}
          >
            <Text allowFontScaling style={styles.smallButtonLabel}>
              비교
            </Text>
          </GlassButton>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create((theme) => ({
  card: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderRadius: theme.radii.md,
    borderWidth: 1,
    overflow: 'hidden',
    variants: {
      compact: {
        true: { width: 244 },
        false: { width: '100%' },
      },
      highlighted: {
        true: { borderColor: theme.colors.primary, borderWidth: 2 },
        false: {},
      },
    },
  },
  image: {
    aspectRatio: 1.45,
    backgroundColor: theme.colors.surfaceMuted,
    width: '100%',
  },
  body: { gap: 6, padding: theme.spacing.md },
  title: { color: theme.colors.text, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  provider: { color: theme.colors.textMuted, fontSize: 13 },
  price: { color: theme.colors.text, fontSize: 19, fontWeight: '800' },
  stock: { color: theme.colors.primary, fontSize: 13, fontWeight: '600' },
  soldOut: { color: theme.colors.danger, fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: theme.spacing.sm, marginTop: theme.spacing.xs },
  smallButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.lg,
  },
  smallButtonFallback: { borderColor: theme.colors.border, borderWidth: 1 },
  smallButtonLabel: { color: theme.colors.text, fontSize: 14, fontWeight: '700' },
}));

import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useMutation } from '@apollo/client/react';
import { SaveProductDocument, UnsaveProductDocument } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/database';
import { cacheProducts } from '@/shared/storage/database';
import { useOnline } from '@/providers/network-provider';
import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';
import { glassButtonIconSize } from '@/shared/ui/glass-button';
import { formatMoney } from './product-model';

type ProductCardProps = Readonly<{
  compact?: boolean;
  highlighted?: boolean;
  horizontal?: boolean;
  product: CachedProduct;
}>;

export const ProductCard = ({
  compact = false,
  highlighted = false,
  horizontal = false,
  product,
}: ProductCardProps) => {
  const [saved, setSaved] = useState(product.isSaved);
  const [saveProduct] = useMutation(SaveProductDocument);
  const [unsaveProduct] = useMutation(UnsaveProductDocument);
  const { theme } = useUnistyles();
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  styles.useVariants({ compact, highlighted, horizontal });

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

  const details = (
    <>
      <Text
        allowFontScaling
        lineBreakStrategyIOS="hangul-word"
        maxFontSizeMultiplier={2}
        numberOfLines={horizontal || compact ? 2 : 3}
        style={styles.title}
        textBreakStrategy="balanced"
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
    </>
  );

  const saveButton = (
    <Pressable
      accessibilityLabel={`${product.title} ${saved ? '찜 해제' : '찜'}`}
      accessibilityRole="button"
      onPress={() => void toggleSaved()}
      style={({ pressed }) => [styles.smallButton, pressed && styles.pressed]}
    >
      <View style={styles.smallButtonSurface} testID="product-card-bookmark-surface">
        <Image
          contentFit="contain"
          source={saved ? 'sf:bookmark.fill' : 'sf:bookmark'}
          style={styles.smallButtonIcon}
          tintColor={theme.colors.text}
        />
      </View>
    </Pressable>
  );

  return (
    <View
      accessibilityLabel={`${product.title}, ${formatMoney(product.totalMinor, product.currency)}`}
      style={styles.card}
    >
      <View style={horizontal ? styles.horizontalTop : undefined}>
        <Pressable
          accessibilityHint="구매 링크를 엽니다"
          accessibilityLabel={`${product.title} 구매 링크`}
          accessibilityRole="button"
          onPress={() => void open()}
          style={horizontal ? styles.horizontalImageButton : styles.imageButton}
        >
          <Image
            accessibilityLabel={`${product.title} 상품 이미지`}
            contentFit="cover"
            source={product.imageUrl}
            style={horizontal ? styles.horizontalImage : styles.image}
            transition={reducedMotion ? 0 : 150}
          />
        </Pressable>
        <View style={styles.body}>
          {horizontal ? (
            <View style={styles.horizontalDetails}>
              <View style={styles.horizontalInfo}>{details}</View>
              {saveButton}
            </View>
          ) : (
            <>
              {details}
              <View style={styles.actions}>{saveButton}</View>
            </>
          )}
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
    width: '100%',
    variants: {
      highlighted: {
        true: { borderColor: theme.colors.primary, borderWidth: 2 },
        false: {},
      },
    },
  },
  imageButton: { alignSelf: 'stretch' },
  image: {
    aspectRatio: 1.45,
    backgroundColor: theme.colors.surfaceMuted,
    width: '100%',
    variants: {
      compact: {
        true: { aspectRatio: 1 },
      },
    },
  },
  body: {
    gap: theme.spacing.xs,
    padding: theme.spacing.md,
    variants: {
      compact: {
        true: { gap: theme.spacing.xs, padding: theme.spacing.sm },
      },
      horizontal: {
        true: { flex: 1, padding: theme.spacing.sm },
      },
    },
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.typography.productCard.title.regular.fontSize,
    fontWeight: '700',
    lineHeight: theme.typography.productCard.title.regular.lineHeight,
    variants: {
      compact: {
        true: {
          fontSize: theme.typography.productCard.title.compact.fontSize,
          lineHeight: theme.typography.productCard.title.compact.lineHeight,
        },
      },
    },
  },
  provider: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.productCard.provider.regular,
  },
  price: {
    color: theme.colors.text,
    fontSize: theme.typography.productCard.price.regular,
    fontWeight: '800',
    variants: {
      compact: {
        true: { fontSize: theme.typography.productCard.price.compact },
      },
    },
  },
  stock: {
    color: theme.colors.primary,
    fontSize: theme.typography.productCard.status.regular,
    fontWeight: '600',
  },
  soldOut: {
    color: theme.colors.danger,
    fontSize: theme.typography.productCard.status.regular,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    variants: {
      compact: {
        true: { marginTop: 0 },
      },
    },
  },
  horizontalDetails: { flex: 1, flexDirection: 'row', gap: theme.spacing.sm },
  horizontalImage: {
    backgroundColor: theme.colors.surfaceMuted,
    height: 112,
    width: 112,
  },
  horizontalImageButton: { flexShrink: 0, height: 112, width: 112 },
  horizontalInfo: { flex: 1, gap: theme.spacing.xs },
  horizontalTop: { flexDirection: 'row' },
  smallButton: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  smallButtonSurface: {
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderCurve: 'continuous',
    borderColor: theme.colors.border,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  pressed: { opacity: 0.72 },
  smallButtonIcon: { height: glassButtonIconSize, width: glassButtonIconSize },
}));

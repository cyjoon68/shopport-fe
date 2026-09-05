import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { useOnline } from '@/providers/network-provider';
import { useReducedMotion } from '@/shared/accessibility/hooks';
import { glassButtonIconSize, PlatformIcon } from '@/shared/components';
import { capturePrivateWriteGeneration } from '@/shared/storage';

import { useUpdateSavedProduct } from '../api/hooks';
import { formatMoney } from '../domain/format-money';
import { formatStockFreshness } from '../domain/format-stock-freshness';
import type { ProductCardProps } from '../types';

export const ProductCard = ({
  compact = false,
  highlighted = false,
  horizontal = false,
  product,
}: ProductCardProps) => {
  const [savedState, setSavedState] = useState({
    productId: product.id,
    value: product.isSaved,
  });
  const saved = savedState.productId === product.id ? savedState.value : product.isSaved;
  const productIdRef = useRef(product.id);
  productIdRef.current = product.id;
  const operationRef = useRef<symbol | null>(null);
  const updateSavedProduct = useUpdateSavedProduct();
  const { theme } = useUnistyles();
  const online = useOnline();
  const reducedMotion = useReducedMotion();
  const stockStatus =
    product.availability === 'IN_STOCK'
      ? '구매 가능'
      : product.availability === 'OUT_OF_STOCK'
        ? '품절'
        : '재고 확인 필요';
  const stockStyle =
    product.availability === 'IN_STOCK'
      ? styles.stock
      : product.availability === 'OUT_OF_STOCK'
        ? styles.soldOut
        : styles.unknownStock;
  const stockFreshness = formatStockFreshness(
    product.availability,
    product.observedAt,
    new Date(),
  );
  styles.useVariants({ compact, highlighted, horizontal });

  useEffect(
    () => setSavedState({ productId: product.id, value: product.isSaved }),
    [product.id, product.isSaved],
  );

  const toggleSaved = async (): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '온라인에서 찜을 변경할 수 있습니다.');
      return;
    }
    const next = !saved;
    const productId = product.id;
    const capturedGeneration = capturePrivateWriteGeneration();
    const operation = Symbol();
    operationRef.current = operation;
    const isCurrent = (): boolean =>
      operationRef.current === operation &&
      productIdRef.current === productId &&
      capturePrivateWriteGeneration() === capturedGeneration;
    try {
      const userError = await updateSavedProduct(productId, saved);
      if (!isCurrent()) return;
      if (userError) {
        Alert.alert('찜 변경 실패', userError);
        return;
      }
    } catch {
      if (!isCurrent()) return;
      Alert.alert('찜 변경 실패', '연결을 확인하고 다시 시도해 주세요.');
      return;
    }
    setSavedState({ productId, value: next });
    await Haptics.selectionAsync().catch(() => undefined);
  };

  const open = async (): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '구매 링크는 온라인에서 열 수 있습니다.');
      return;
    }
    try {
      const url = new URL(product.outboundUrl);
      if (url.protocol !== 'https:' || url.username || url.password) {
        Alert.alert('안전하지 않은 링크', '구매 링크를 열 수 없습니다.');
        return;
      }
      await Linking.openURL(url.toString());
    } catch {
      Alert.alert('구매 링크를 열 수 없어요', '다시 시도해 주세요.');
    }
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
      <Text allowFontScaling style={stockStyle}>
        {stockStatus}
      </Text>
      <Text allowFontScaling style={styles.stockFreshness}>
        {stockFreshness}
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
        <PlatformIcon
          color={theme.colors.text}
          name={saved ? 'bookmark-filled' : 'bookmark'}
          size={glassButtonIconSize}
          testID={
            saved ? 'product-card-bookmark-filled-icon' : 'product-card-bookmark-icon'
          }
        />
      </View>
    </Pressable>
  );

  return (
    <View
      accessibilityLabel={`${product.title}, ${formatMoney(product.totalMinor, product.currency)}, ${stockStatus}, ${stockFreshness}`}
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
  unknownStock: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.productCard.status.regular,
    fontWeight: '600',
  },
  stockFreshness: {
    color: theme.colors.textMuted,
    fontSize: theme.typography.productCard.provider.regular,
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
}));

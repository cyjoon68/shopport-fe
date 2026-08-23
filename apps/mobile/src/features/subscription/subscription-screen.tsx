import { useQuery } from '@apollo/client/react';
import { Screen, SectionTitle } from '@shopport/ui';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Text, View } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';
import Purchases from 'react-native-purchases';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth/session-provider';
import { ViewerDocument } from '@/graphql/generated/graphql';
import { useOnline } from '@/providers/network-provider';
import { GlassActionButton, GlassButton } from '@/shared/ui/glass-button';

import { configureRevenueCat } from './revenuecat';
import { syncViewerEntitlement } from './subscription-sync';

const productIds = new Set(['shopport_pro_monthly', 'shopport_pro_annual']);

export const SubscriptionScreen = () => {
  const { status } = useSession();
  const online = useOnline();
  const { data, refetch } = useQuery(ViewerDocument, {
    skip: status !== 'authenticated',
  });
  const [packages, setPackages] = useState<Array<PurchasesPackage>>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const userId = data?.viewer.id;
    if (!userId) return;
    void (async () => {
      try {
        const ready = await configureRevenueCat(userId);
        setConfigured(ready);
        if (!ready) return;
        const offerings = await Purchases.getOfferings();
        setPackages(
          (offerings.current?.availablePackages ?? []).filter(({ product }) =>
            productIds.has(product.identifier),
          ),
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [data?.viewer.id]);

  if (status === 'guest') return <Redirect href="/auth" />;

  const sync = async (expectedPro: boolean): Promise<'SYNCED' | 'TIMEOUT'> => {
    setSyncing(true);
    try {
      const result = await syncViewerEntitlement(refetch, expectedPro);
      if (result === 'TIMEOUT') {
        Alert.alert(
          '구독 동기화 지연',
          '스토어 결제는 완료되었지만 계정 반영이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.',
        );
      }
      return result;
    } finally {
      setSyncing(false);
    }
  };

  const purchase = async (item: PurchasesPackage): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '구독 구매는 온라인에서 할 수 있습니다.');
      return;
    }
    try {
      const result = await Purchases.purchasePackage(item);
      if (result.customerInfo.entitlements.active.pro) {
        if ((await sync(true)) === 'SYNCED') {
          Alert.alert('구독 완료', 'Shopport Pro가 활성화되었습니다.');
        }
      }
    } catch (error) {
      if (error instanceof Error && /cancel/iu.test(error.message)) return;
      Alert.alert('구매 실패', '스토어 연결을 확인하고 다시 시도해 주세요.');
    }
  };

  const restore = async (): Promise<void> => {
    if (!online) {
      Alert.alert('오프라인', '구매 복원은 온라인에서 할 수 있습니다.');
      return;
    }
    try {
      const info = await Purchases.restorePurchases();
      const restored = Boolean(info.entitlements.active.pro);
      if ((await sync(restored)) === 'SYNCED') {
        Alert.alert(restored ? '복원 완료' : '복원할 구매 없음');
      }
    } catch {
      Alert.alert('복원 실패', '스토어 연결을 확인하고 다시 시도해 주세요.');
    }
  };

  const manage = async (): Promise<void> => {
    const info = await Purchases.getCustomerInfo();
    if (info.managementURL) await Linking.openURL(info.managementURL);
  };

  const viewer = data?.viewer;
  return (
    <Screen testID="subscription-screen">
      <View style={styles.root}>
        <View style={styles.heading}>
          <SectionTitle>Shopport Pro</SectionTitle>
          <Text allowFontScaling style={styles.description}>
            텍스트 50회, 이미지 10회를 매일 KST 자정에 새로 제공합니다.
          </Text>
          {viewer ? (
            <Text allowFontScaling style={styles.status}>
              {viewer.entitlement.key === 'pro' && viewer.entitlement.isActive
                ? 'Pro 사용 중'
                : `무료 체험 종료 ${new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(viewer.trialEndsAt))}`}
            </Text>
          ) : null}
        </View>
        {loading || syncing ? (
          <ActivityIndicator accessibilityLabel="구독 상품 불러오는 중" />
        ) : null}
        {syncing ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            스토어 결제를 계정에 반영하는 중입니다
          </Text>
        ) : null}
        {!configured ? (
          <Text accessibilityLiveRegion="polite" style={styles.notice}>
            이 빌드에는 RevenueCat 키가 없습니다. development build와 sandbox 키를
            설정하세요.
          </Text>
        ) : null}
        <View style={styles.packages}>
          {packages.map((item) => (
            <GlassButton
              accessibilityLabel={`${item.product.title}, ${item.product.priceString}`}
              disabled={syncing || !online}
              fallbackStyle={styles.packageFallback}
              key={item.identifier}
              onPress={() => void purchase(item)}
              style={styles.package}
            >
              <Text allowFontScaling style={styles.packageTitle}>
                {item.product.title}
              </Text>
              <Text allowFontScaling style={styles.price}>
                {item.product.priceString}
              </Text>
            </GlassButton>
          ))}
        </View>
        {configured ? (
          <GlassActionButton
            disabled={syncing || !online}
            onPress={() => void restore()}
            variant="secondary"
          >
            구매 복원
          </GlassActionButton>
        ) : null}
        {viewer?.entitlement.key === 'pro' &&
        viewer.entitlement.isActive &&
        configured ? (
          <GlassActionButton onPress={() => void manage()} variant="secondary">
            구독 관리·해지
          </GlassActionButton>
        ) : null}
        <Text allowFontScaling style={styles.footnote}>
          무료 체험은 첫 로그인부터 168시간이며 결제수단이 필요 없습니다. 스토어 가격이
          실제 결제 가격입니다.
        </Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, gap: theme.spacing.lg, padding: theme.spacing.xl },
  heading: { gap: theme.spacing.md },
  description: { color: theme.colors.textMuted, fontSize: 16, lineHeight: 24 },
  status: { color: theme.colors.primary, fontSize: 16, fontWeight: '800' },
  notice: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.md,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    padding: theme.spacing.lg,
  },
  packages: { gap: theme.spacing.md },
  package: {
    borderRadius: theme.radii.md,
    gap: theme.spacing.sm,
    minHeight: 88,
    padding: theme.spacing.lg,
  },
  packageFallback: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
  },
  packageTitle: { color: theme.colors.text, fontSize: 17, fontWeight: '800' },
  price: { color: theme.colors.primary, fontSize: 22, fontWeight: '900' },
  footnote: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 20 },
}));

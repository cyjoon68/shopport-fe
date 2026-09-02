import { Redirect } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { useSession } from '@/features/auth';
import { GlassActionButton, Screen } from '@/shared/components';

export const AuthScreen = () => {
  const { error, login, status } = useSession();
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  if (status === 'authenticated' || status === 'offline-authenticated')
    return <Redirect href="/" />;
  if (status === 'booting') {
    return (
      <Screen testID="auth-booting">
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="세션 확인 중" size="large" />
        </View>
      </Screen>
    );
  }
  const run = async (): Promise<void> => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      await login();
    } catch {
      return;
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return (
    <Screen testID="auth-screen">
      <View style={styles.root}>
        <View style={styles.hero}>
          <Text accessibilityRole="header" allowFontScaling style={styles.brand}>
            Shopport
          </Text>
          <Text allowFontScaling style={styles.subtitle}>
            나만의 쇼핑 에이전트
          </Text>
        </View>
        <View style={styles.actions}>
          {error ? (
            <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
              {error}
            </Text>
          ) : null}
          <GlassActionButton disabled={busy} onPress={() => void run()} variant="kakao">
            카카오로 시작하기
          </GlassActionButton>
        </View>
        <Text allowFontScaling style={styles.terms}>
          계속하면 개인정보처리방침과 서비스 약관에 동의한 것으로 간주합니다.
        </Text>
      </View>
    </Screen>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: {
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
  },
  brand: {
    color: theme.colors.primary,
    fontSize: 48,
    fontWeight: '900',
    letterSpacing: -2,
  },
  subtitle: { color: theme.colors.textMuted, fontSize: 18, lineHeight: 26 },
  actions: { gap: theme.spacing.md },
  error: {
    color: theme.colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  terms: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 20,
    textAlign: 'center',
  },
}));

import { useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Redirect } from 'expo-router';
import { StyleSheet } from 'react-native-unistyles';
import { ActionButton, Screen } from '@shopport/ui';
import { useSession } from './session-provider';

export const AuthScreen = () => {
  const { error, login, loginDemo, status } = useSession();
  const [busy, setBusy] = useState(false);
  if (status === 'authenticated') return <Redirect href="/" />;
  if (status === 'booting') {
    return (
      <Screen testID="auth-booting">
        <View style={styles.loading}>
          <ActivityIndicator accessibilityLabel="세션 확인 중" size="large" />
        </View>
      </Screen>
    );
  }
  const run = async (provider: 'apple' | 'kakao'): Promise<void> => {
    setBusy(true);
    await login(provider);
    setBusy(false);
  };
  return (
    <Screen testID="auth-screen">
      <View style={styles.root}>
        <View style={styles.hero}>
          <Text accessibilityRole="header" allowFontScaling style={styles.brand}>
            Shopport
          </Text>
          <Text allowFontScaling style={styles.title}>
            무엇을 살지, 대화로 찾으세요
          </Text>
          <Text allowFontScaling style={styles.description}>
            여러 쇼핑몰의 승인된 상품 정보를 한곳에서 비교합니다.
          </Text>
        </View>
        <View style={styles.actions}>
          {Platform.OS === 'ios' ? (
            <AppleAuthentication.AppleAuthenticationButton
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              cornerRadius={14}
              onPress={() => void run('apple')}
              style={styles.appleButton}
            />
          ) : (
            <ActionButton
              disabled={busy}
              onPress={() => void run('apple')}
              variant="secondary"
            >
              Apple로 계속
            </ActionButton>
          )}
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run('kakao')}
            style={({ pressed }) => [styles.kakaoButton, pressed && styles.pressed]}
          >
            <Text allowFontScaling style={styles.kakaoLabel}>
              카카오로 계속
            </Text>
          </Pressable>
          {__DEV__ ? (
            <ActionButton
              disabled={busy}
              onPress={() => void loginDemo()}
              variant="secondary"
            >
              로컬 데모로 시작
            </ActionButton>
          ) : null}
          {error ? (
            <Text accessibilityLiveRegion="polite" allowFontScaling style={styles.error}>
              {error}
            </Text>
          ) : null}
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
    justifyContent: 'space-between',
    padding: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  loading: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  hero: { gap: theme.spacing.md, marginTop: 64 },
  brand: { color: theme.colors.primary, fontSize: 18, fontWeight: '800' },
  title: {
    color: theme.colors.text,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 44,
  },
  description: { color: theme.colors.textMuted, fontSize: 17, lineHeight: 26 },
  actions: { gap: theme.spacing.md },
  appleButton: { height: 52, width: '100%' },
  kakaoButton: {
    alignItems: 'center',
    backgroundColor: '#FEE500',
    borderRadius: theme.radii.md,
    justifyContent: 'center',
    minHeight: 52,
  },
  pressed: { opacity: 0.72 },
  kakaoLabel: { color: '#191919', fontSize: 16, fontWeight: '700' },
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
    textAlign: 'center',
  },
}));

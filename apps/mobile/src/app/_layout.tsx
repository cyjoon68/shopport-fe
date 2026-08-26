import '@/shared/observability/sentry';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { AppProviders } from '@/providers/app-providers';
import { useReducedMotion } from '@/shared/accessibility/hooks';

const RootStack = () => {
  const reducedMotion = useReducedMotion();
  const { theme } = useUnistyles();
  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          animation: reducedMotion ? 'none' : 'default',
          contentStyle: styles.content,
          headerBackButtonDisplayMode: 'minimal',
          headerStyle: styles.header,
          headerTintColor: theme.colors.text,
        }}
      >
        <Stack.Screen
          name="(drawer)"
          options={{ animation: 'none', headerShown: false }}
        />
        <Stack.Screen name="auth" options={{ animation: 'none', headerShown: false }} />
        <Stack.Screen name="products" options={{ title: '상품 리스트' }} />
        <Stack.Screen name="favorites" options={{ title: '저장된 상품' }} />
        <Stack.Screen name="images" options={{ title: '업로드한 이미지' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
      </Stack>
    </>
  );
};

const RootLayout = () => (
  <AppProviders>
    <RootStack />
  </AppProviders>
);

export default RootLayout;

const styles = StyleSheet.create((theme) => ({
  content: { backgroundColor: theme.colors.background },
  header: { backgroundColor: theme.colors.background },
}));

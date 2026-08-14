import 'react-native-gesture-handler';
import '@/theme/unistyles';
import '@/shared/observability/sentry';
import { Pressable, Text } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { AppProviders } from '@/providers/app-providers';
import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';

const HeaderAction = ({
  label,
  route,
}: Readonly<{ label: string; route: '/history' | '/settings' }>) => (
  <Pressable
    accessibilityLabel={`${label} 화면 열기`}
    accessibilityRole="button"
    hitSlop={8}
    onPress={() => router.push(route)}
    style={({ pressed }) => [styles.headerAction, pressed && styles.pressed]}
  >
    <Text
      allowFontScaling
      maxFontSizeMultiplier={2}
      style={styles.headerActionLabel}
    >
      {label}
    </Text>
  </Pressable>
);

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
          name="index"
          options={{
            headerRight: () => <HeaderAction label="기록" route="/history" />,
            title: 'Shopport',
          }}
        />
        <Stack.Screen name="history" options={{ title: '대화 기록' }} />
        <Stack.Screen name="favorites" options={{ title: '찜한 상품' }} />
        <Stack.Screen name="settings" options={{ title: '설정' }} />
        <Stack.Screen
          name="subscription"
          options={{ presentation: 'formSheet', title: '구독' }}
        />
        <Stack.Screen
          name="auth"
          options={{ headerShown: false, presentation: 'modal' }}
        />
        <Stack.Screen name="chat" options={{ headerShown: false }} />
        <Stack.Screen name="product" options={{ headerShown: false }} />
        <Stack.Screen name="compare" options={{ headerShown: false }} />
        <Stack.Screen name="storybook" options={{ headerShown: false }} />
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
  headerAction: {
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: theme.spacing.sm,
  },
  headerActionLabel: { color: theme.colors.text, fontSize: 15 },
  pressed: { opacity: 0.5 },
}));

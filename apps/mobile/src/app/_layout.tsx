import 'react-native-gesture-handler';
import '@/theme/unistyles';
import '@/shared/observability/sentry';
import { useWindowDimensions } from 'react-native';
import { Drawer, DrawerToggleButton } from 'expo-router/drawer';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { AppProviders } from '@/providers/app-providers';
import { environment } from '@/shared/config/environment';

const RootDrawer = () => {
  const { width } = useWindowDimensions();
  const { theme } = useUnistyles();
  const tablet = width >= 768;
  const hiddenOptions = { drawerItemStyle: styles.hidden } as const;
  return (
    <>
      <StatusBar style="auto" />
      <Drawer
        screenOptions={{
          drawerActiveTintColor: theme.colors.primary,
          drawerInactiveTintColor: theme.colors.textMuted,
          drawerStyle: styles.drawer,
          drawerType: tablet ? 'permanent' : 'front',
          headerStyle: styles.header,
          headerTintColor: theme.colors.text,
          headerLeft: tablet
            ? () => null
            : (props) => (
                <DrawerToggleButton
                  {...props}
                  accessibilityLabel="내비게이션 메뉴 열기"
                />
              ),
          overlayAccessibilityLabel: '내비게이션 메뉴 닫기',
          sceneStyle: styles.scene,
          swipeEnabled: !tablet,
        }}
      >
        <Drawer.Screen
          name="index"
          options={{ drawerLabel: '새 대화', title: '새 대화' }}
        />
        <Drawer.Screen
          name="history"
          options={{ drawerLabel: '대화 기록', title: '대화 기록' }}
        />
        <Drawer.Screen name="favorites" options={{ drawerLabel: '찜', title: '찜' }} />
        <Drawer.Screen
          name="subscription"
          options={{ drawerLabel: '구독', title: '구독' }}
        />
        <Drawer.Screen name="settings" options={{ drawerLabel: '설정', title: '설정' }} />
        <Drawer.Screen
          name="auth"
          options={{ ...hiddenOptions, headerShown: false, swipeEnabled: false }}
        />
        <Drawer.Screen name="chat" options={hiddenOptions} />
        <Drawer.Screen name="product" options={hiddenOptions} />
        <Drawer.Screen name="compare" options={hiddenOptions} />
        <Drawer.Screen
          name="storybook"
          options={{
            ...hiddenOptions,
            ...(environment.storybookEnabled
              ? { drawerItemStyle: styles.storybookItem, title: 'Storybook' }
              : {}),
          }}
        />
      </Drawer>
    </>
  );
};

const RootLayout = () => (
  <AppProviders>
    <RootDrawer />
  </AppProviders>
);

export default RootLayout;

const styles = StyleSheet.create((theme) => ({
  drawer: { backgroundColor: theme.colors.surface, width: 296 },
  header: { backgroundColor: theme.colors.background },
  scene: { backgroundColor: theme.colors.background },
  hidden: { display: 'none' },
  storybookItem: { display: 'flex' },
}));

import { Drawer } from 'expo-router/drawer';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { ShopportDrawerContent } from '@/features/navigation/shopport-drawer-content';

const DrawerLayout = () => {
  const { theme } = useUnistyles();
  return (
    <Drawer
      drawerContent={(props) => <ShopportDrawerContent {...props} />}
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerStyle: styles.header,
        headerTintColor: theme.colors.text,
        sceneStyle: styles.content,
      }}
    >
      <Drawer.Screen name="index" options={{ headerShown: false }} />
      <Drawer.Screen name="history" options={{ title: '대화 기록' }} />
      <Drawer.Screen name="settings" options={{ title: '설정' }} />
    </Drawer>
  );
};

export default DrawerLayout;

const styles = StyleSheet.create((theme) => ({
  content: { backgroundColor: theme.colors.background },
  header: { backgroundColor: theme.colors.background },
}));

import { Drawer } from 'expo-router/drawer';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { ShopportDrawerContent } from '@/navigation';

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
    </Drawer>
  );
};

export default DrawerLayout;

const styles = StyleSheet.create((theme) => ({
  content: { backgroundColor: theme.colors.background },
  header: { backgroundColor: theme.colors.background },
}));

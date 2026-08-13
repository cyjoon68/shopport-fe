import { Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';

const CompareLayout = () => {
  const reducedMotion = useReducedMotion();
  const { theme } = useUnistyles();
  return (
    <Stack
      screenOptions={{
        animation: reducedMotion ? 'none' : 'default',
        contentStyle: styles.content,
        headerStyle: styles.header,
        headerTintColor: theme.colors.text,
      }}
    >
      <Stack.Screen name="index" options={{ title: '상품 비교' }} />
    </Stack>
  );
};

export default CompareLayout;

const styles = StyleSheet.create((theme) => ({
  content: { backgroundColor: theme.colors.background },
  header: { backgroundColor: theme.colors.background },
}));

import { Stack } from 'expo-router';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';
import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';

const ChatLayout = () => {
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
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
};

export default ChatLayout;

const styles = StyleSheet.create((theme) => ({
  content: { backgroundColor: theme.colors.background },
  header: { backgroundColor: theme.colors.background },
}));

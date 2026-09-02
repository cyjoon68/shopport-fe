import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

type ScreenProps = Readonly<{
  children: ReactNode;
  testID?: string;
}>;

export const Screen = ({ children, testID }: ScreenProps) => (
  <SafeAreaView edges={['bottom']} style={styles.safeArea} testID={testID}>
    <View style={styles.content}>{children}</View>
  </SafeAreaView>
);

const styles = StyleSheet.create((theme) => ({
  safeArea: { backgroundColor: theme.colors.background, flex: 1 },
  content: { flex: 1 },
}));

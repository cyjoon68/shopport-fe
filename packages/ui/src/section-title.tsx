import { Text } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

type SectionTitleProps = Readonly<{ children: string }>;

export const SectionTitle = ({ children }: SectionTitleProps) => (
  <Text accessibilityRole="header" allowFontScaling style={styles.title}>
    {children}
  </Text>
);

const styles = StyleSheet.create((theme) => ({
  title: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
}));

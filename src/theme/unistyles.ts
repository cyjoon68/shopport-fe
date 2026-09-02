import { breakpoints, themes } from '@shopport/tokens';
import { StyleSheet } from 'react-native-unistyles';

StyleSheet.configure({
  breakpoints,
  themes,
  settings: { adaptiveThemes: true },
});

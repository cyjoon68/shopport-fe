import 'react-native-unistyles/mocks';
import '@/theme/unistyles';

jest.mock('expo-glass-effect', () => ({
  GlassView: 'GlassView',
  isGlassEffectAPIAvailable: () => false,
}));

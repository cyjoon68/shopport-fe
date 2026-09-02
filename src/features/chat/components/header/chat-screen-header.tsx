import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { GlassButton, glassButtonIconSize } from '@/shared/components';

import type { ChatScreenHeaderProps } from '../../types';
import { ChatSegmentedControl } from './chat-segmented-control';

export const ChatScreenHeader = ({
  onOpenDrawer,
  onOpenFavorites,
  onValueChange,
  unread,
  value,
}: ChatScreenHeaderProps) => {
  const { theme } = useUnistyles();

  return (
    <SafeAreaView edges={['top']} style={styles.header}>
      <GlassButton
        accessibilityLabel="메뉴 열기"
        hitSlop={8}
        onPress={onOpenDrawer}
        style={styles.button}
      >
        <Image
          contentFit="contain"
          source="sf:sidebar.left"
          style={styles.symbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
      <ChatSegmentedControl
        onValueChange={onValueChange}
        testID="chat-segmented-control"
        unread={unread}
        value={value}
      />
      <GlassButton
        accessibilityLabel="저장한 상품 보기"
        hitSlop={8}
        onPress={onOpenFavorites}
        style={styles.button}
      >
        <Image
          contentFit="contain"
          source="sf:bookmark"
          style={styles.symbol}
          tintColor={theme.colors.text}
        />
      </GlassButton>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create((theme) => ({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  symbol: { height: glassButtonIconSize, width: glassButtonIconSize },
}));

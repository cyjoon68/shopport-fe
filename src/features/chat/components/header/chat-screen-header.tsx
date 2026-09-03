import { SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { GlassButton, glassButtonIconSize, PlatformIcon } from '@/shared/components';

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
        <PlatformIcon color={theme.colors.text} name="menu" size={glassButtonIconSize} />
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
        <PlatformIcon
          color={theme.colors.text}
          name="bookmark"
          size={glassButtonIconSize}
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
}));

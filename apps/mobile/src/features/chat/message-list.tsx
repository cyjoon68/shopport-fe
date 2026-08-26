import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native-unistyles';

import { useReducedMotion } from '@/shared/accessibility/use-reduced-motion';
import type { CachedProduct } from '@/shared/storage/database';

import { MessageListItem } from './message-list-item';
import type { DisplayMessage } from './message-model';
import { activeAskUserRequest } from './message-model';

type MessageListProps = Readonly<{
  messages: ReadonlyArray<DisplayMessage>;
  isGenerating?: boolean;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

const maintainVisibleContentPosition = {
  autoscrollToBottomThreshold: 0.2,
  startRenderingFromBottom: true,
} as const;
const messageKey = (message: DisplayMessage): string => message.id;
const messageType = (message: DisplayMessage): string => message.role;

export const MessageList = ({
  isGenerating = false,
  messages,
  onAskUserPress,
  onProductSelect,
}: MessageListProps) => {
  const reducedMotion = useReducedMotion();
  const activeAskUserId = activeAskUserRequest(messages)?.id ?? null;
  const latestMessageId = messages.at(-1)?.id ?? null;
  const listRef = useRef<FlashListRef<DisplayMessage> | null>(null);
  const latestUserMessageId = messages.findLast(({ role }) => role === 'user')?.id;
  const previousLatestUserMessageIdRef = useRef(latestUserMessageId);

  useEffect(() => {
    const previousLatestUserMessageId = previousLatestUserMessageIdRef.current;
    previousLatestUserMessageIdRef.current = latestUserMessageId;
    if (latestUserMessageId !== previousLatestUserMessageId)
      listRef.current?.scrollToEnd({ animated: true });
  }, [latestUserMessageId]);
  const renderMessage = useCallback(
    ({ item }: Readonly<{ item: DisplayMessage }>) => (
      <MessageListItem
        activeAskUserId={
          item.askUsers.some(({ id }) => id === activeAskUserId) ? activeAskUserId : null
        }
        animate={!reducedMotion && isGenerating && item.id === latestMessageId}
        message={item}
        onAskUserPress={onAskUserPress}
        onProductSelect={onProductSelect}
      />
    ),
    [
      activeAskUserId,
      isGenerating,
      latestMessageId,
      onAskUserPress,
      onProductSelect,
      reducedMotion,
    ],
  );

  return (
    <FlashList
      contentContainerStyle={styles.list}
      data={messages}
      getItemType={messageType}
      keyExtractor={messageKey}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      ref={listRef}
      style={styles.flex}
      renderItem={renderMessage}
    />
  );
};

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
}));

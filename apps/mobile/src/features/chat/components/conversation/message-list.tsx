import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native-unistyles';

import { useReducedMotion } from '@/shared/accessibility/hooks';

import { activeAskUserRequest } from '../../domain/models';
import type { MessageListProps } from '../../types';
import { MessageListItem } from './message-list-item';

const maintainVisibleContentPosition = {
  autoscrollToBottomThreshold: 0.2,
  startRenderingFromBottom: true,
} as const;
const messageKey = (message: MessageListProps['messages'][number]): string => message.id;
const messageType = (message: MessageListProps['messages'][number]): string =>
  message.role;

export const MessageList = ({
  isGenerating = false,
  messages,
  onAskUserPress,
  onEditMessage,
  onProductSelect,
}: MessageListProps) => {
  const reducedMotion = useReducedMotion();
  const activeAskUserId = activeAskUserRequest(messages)?.id ?? null;
  const latestMessageId = messages.at(-1)?.id ?? null;
  const listRef = useRef<FlashListRef<MessageListProps['messages'][number]> | null>(null);
  const latestUserMessageId = messages.findLast(({ role }) => role === 'user')?.id;
  const previousLatestUserMessageIdRef = useRef(latestUserMessageId);

  useEffect(() => {
    const previousLatestUserMessageId = previousLatestUserMessageIdRef.current;
    previousLatestUserMessageIdRef.current = latestUserMessageId;
    if (latestUserMessageId !== previousLatestUserMessageId)
      listRef.current?.scrollToEnd({ animated: true });
  }, [latestUserMessageId]);
  const renderMessage = ({
    item,
  }: Readonly<{ item: MessageListProps['messages'][number] }>) => (
    <MessageListItem
      activeAskUserId={
        item.askUsers.some(({ id }) => id === activeAskUserId) ? activeAskUserId : null
      }
      animate={!reducedMotion && isGenerating && item.id === latestMessageId}
      message={item}
      onAskUserPress={onAskUserPress}
      onEditMessage={onEditMessage}
      onProductSelect={onProductSelect}
    />
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

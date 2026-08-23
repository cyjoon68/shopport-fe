import { FlashList, type FlashListRef } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { CachedProduct } from '@/shared/storage/database';

import { ChatProductRow } from './chat-product-row';
import type { DisplayMessage } from './message-model';
import { activeAskUserRequest } from './message-model';

export {
  activeAskUserRequest,
  fromHistoricalMessage,
  fromLiveMessage,
  mergeMessages,
} from './message-model';
export type { DisplayMessage } from './message-model';

type MessageListProps = Readonly<{
  messages: ReadonlyArray<DisplayMessage>;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

const maintainVisibleContentPosition = {
  autoscrollToBottomThreshold: 0.2,
} as const;

const MessageRow = ({
  activeAskUserId,
  message,
  onAskUserPress,
  onProductSelect,
}: Readonly<{
  activeAskUserId: string | null;
  message: DisplayMessage;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>) => {
  styles.useVariants({ role: message.role });
  const transcriptText = message.askUsers.reduce(
    (text, { request }) => text.replace(request.question, '').trim(),
    message.text,
  );
  if (
    !transcriptText &&
    !message.askUsers.length &&
    !message.images.length &&
    !message.products.length
  )
    return null;
  return (
    <View
      accessibilityLabel={message.role === 'user' ? '내 메시지' : 'Shopport 답변'}
      style={styles.row}
    >
      {transcriptText ? (
        <View style={styles.bubble}>
          <Text
            allowFontScaling
            maxFontSizeMultiplier={2.5}
            selectable
            style={styles.text}
          >
            {transcriptText}
          </Text>
        </View>
      ) : null}
      {message.askUsers.map(({ id, request }) => {
        const question = (
          <View style={styles.bubble}>
            <Text
              allowFontScaling
              maxFontSizeMultiplier={2.5}
              selectable
              style={styles.text}
            >
              {request.question}
            </Text>
          </View>
        );
        return id === activeAskUserId && onAskUserPress ? (
          <Pressable
            accessibilityLabel={`추가 질문 열기: ${request.question}`}
            accessibilityRole="button"
            key={id}
            onPress={onAskUserPress}
            style={styles.askQuestion}
          >
            {question}
          </Pressable>
        ) : (
          <View key={id}>{question}</View>
        );
      })}
      {message.images.map((image) =>
        image.status === 'READY' && image.url ? (
          <Image
            accessibilityLabel="대화에 첨부된 이미지"
            contentFit="cover"
            key={image.id}
            source={image.url}
            style={styles.image}
          />
        ) : (
          <Text accessibilityLiveRegion="polite" key={image.id} style={styles.partStatus}>
            {image.status === 'REJECTED' ? '이미지 처리 실패' : '이미지 처리 중'}
          </Text>
        ),
      )}
      {message.products.length ? (
        <ScrollView
          accessibilityLabel="추천 상품"
          contentContainerStyle={styles.productsContent}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.products}
        >
          {message.products.map((product) => (
            <ChatProductRow
              key={product.id}
              onProductSelect={onProductSelect}
              product={product}
            />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
};

export const MessageList = ({
  messages,
  onAskUserPress,
  onProductSelect,
}: MessageListProps) => {
  const activeAskUserId = activeAskUserRequest(messages)?.id ?? null;
  const listRef = useRef<FlashListRef<DisplayMessage> | null>(null);
  const latestUserMessageId = messages.findLast(({ role }) => role === 'user')?.id;
  const previousLatestUserMessageIdRef = useRef(latestUserMessageId);

  useEffect(() => {
    const previousLatestUserMessageId = previousLatestUserMessageIdRef.current;
    previousLatestUserMessageIdRef.current = latestUserMessageId;
    if (latestUserMessageId !== previousLatestUserMessageId)
      listRef.current?.scrollToEnd({ animated: true });
  }, [latestUserMessageId]);

  return (
    <FlashList
      contentContainerStyle={styles.list}
      data={messages}
      keyExtractor={(message) => message.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={maintainVisibleContentPosition}
      ref={listRef}
      style={styles.flex}
      renderItem={({ item }) => (
        <MessageRow
          activeAskUserId={activeAskUserId}
          message={item}
          onAskUserPress={onAskUserPress}
          onProductSelect={onProductSelect}
        />
      )}
    />
  );
};

const styles = StyleSheet.create((theme) => ({
  flex: { flex: 1 },
  list: {
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
  },
  row: {
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    variants: {
      role: {
        user: { alignItems: 'flex-end' },
        assistant: { alignItems: 'flex-start' },
      },
    },
  },
  bubble: {
    borderRadius: theme.radii.lg,
    maxWidth: '88%',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    variants: {
      role: {
        user: { backgroundColor: theme.colors.primary },
        assistant: { backgroundColor: theme.colors.surface },
      },
    },
  },
  askQuestion: { alignSelf: 'flex-start' },
  text: {
    fontSize: 16,
    lineHeight: 24,
    variants: {
      role: {
        user: { color: theme.colors.primaryText },
        assistant: { color: theme.colors.text },
      },
    },
  },
  image: { borderRadius: theme.radii.md, height: 220, width: 220 },
  partStatus: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.sm,
    color: theme.colors.textMuted,
    fontSize: 13,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  products: { marginHorizontal: -theme.spacing.lg, width: 'auto' },
  productsContent: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
}));

import { Image } from 'expo-image';
import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { CachedProduct } from '@/shared/storage/database';

import { ChatProductRow } from './chat-product-row';
import type { DisplayMessage } from './message-model';

type MessageListItemProps = Readonly<{
  activeAskUserId: string | null;
  animate: boolean;
  message: DisplayMessage;
  onAskUserPress?: (() => void) | undefined;
  onProductSelect?: ((product: CachedProduct) => void) | undefined;
}>;

export const MessageListItem = memo(
  ({
    activeAskUserId,
    animate,
    message,
    onAskUserPress,
    onProductSelect,
  }: MessageListItemProps) => {
    styles.useVariants({ role: message.role });
    const shouldAnimate = useRef(animate).current;
    const animation = useRef(new Animated.Value(shouldAnimate ? 0 : 1)).current;
    const animatedRowStyle = {
      opacity: animation,
      transform: [
        {
          translateY: animation.interpolate({
            inputRange: [0, 1],
            outputRange: [8, 0],
          }),
        },
      ],
    };
    useEffect(() => {
      if (!shouldAnimate) return;
      Animated.timing(animation, {
        duration: 220,
        toValue: 1,
        useNativeDriver: true,
      }).start();
    }, [animation, shouldAnimate]);
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
      <Animated.View
        accessibilityLabel={message.role === 'user' ? '내 메시지' : 'Shopport 답변'}
        style={shouldAnimate ? [styles.row, animatedRowStyle] : styles.row}
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
            <Text
              accessibilityLiveRegion="polite"
              key={image.id}
              style={styles.partStatus}
            >
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
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
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
    borderCurve: 'continuous',
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
  image: {
    borderCurve: 'continuous',
    borderRadius: theme.radii.md,
    height: 220,
    width: 220,
  },
  partStatus: {
    backgroundColor: theme.colors.surfaceMuted,
    borderCurve: 'continuous',
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

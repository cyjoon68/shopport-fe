import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import type { MessageListItemProps } from '../../types';
import { ChatProductRow } from './chat-product-row';

const formatMessageDate = (date: Date): string => {
  const hour = date.getHours();
  const year = date.getFullYear();
  const yearLabel = year === new Date().getFullYear() ? '' : `${year}년 `;
  return `${yearLabel}${date.getMonth() + 1}월 ${date.getDate()}일 ${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}시 ${date.getMinutes()}분`;
};

const messageAccessibilityActions = [
  { label: '메시지 작업 열기', name: 'activate' },
] as const;

export const MessageListItem = ({
  activeAskUserId,
  animate,
  message,
  onAskUserPress,
  onEditMessage,
  onProductSelect,
}: MessageListItemProps) => {
  styles.useVariants({ role: message.role });
  const [actionsOpen, setActionsOpen] = useState(false);
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
  const copyText = [
    transcriptText,
    ...message.askUsers.map(({ request }) => request.question),
  ]
    .filter(Boolean)
    .join('\n\n');
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
      {transcriptText && message.role === 'user' ? (
        <Pressable
          accessibilityActions={messageAccessibilityActions}
          accessibilityHint="길게 눌러 메시지 작업 열기"
          accessibilityRole="button"
          onAccessibilityAction={({ nativeEvent }) => {
            if (nativeEvent.actionName === 'activate') setActionsOpen(true);
          }}
          onLongPress={() => setActionsOpen(true)}
          style={styles.bubble}
        >
          <Text allowFontScaling maxFontSizeMultiplier={2.5} style={styles.text}>
            {transcriptText}
          </Text>
        </Pressable>
      ) : transcriptText ? (
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
      {message.role === 'assistant' && copyText ? (
        <View style={styles.metadata}>
          {message.createdAt ? (
            <Text allowFontScaling style={styles.date}>
              {formatMessageDate(message.createdAt)}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="답변 복사"
            accessibilityRole="button"
            onPress={() => void Clipboard.setStringAsync(copyText)}
            style={styles.copyButton}
          >
            <Image
              contentFit="contain"
              source="sf:doc.on.doc"
              style={styles.copyIcon}
              tintColor={styles.date.color}
            />
          </Pressable>
        </View>
      ) : null}
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
      <Modal
        animationType="fade"
        onRequestClose={() => setActionsOpen(false)}
        transparent
        visible={actionsOpen}
      >
        <View style={styles.actionsBackdrop}>
          <Pressable
            accessibilityLabel="메시지 메뉴 닫기"
            accessibilityRole="button"
            onPress={() => setActionsOpen(false)}
            style={styles.actionsDismiss}
          />
          <View accessibilityViewIsModal style={styles.actionsMenu}>
            {message.createdAt ? (
              <Text allowFontScaling style={styles.actionsDate}>
                {formatMessageDate(message.createdAt)}
              </Text>
            ) : null}
            <Pressable
              accessibilityLabel="메시지 복사"
              accessibilityRole="button"
              onPress={() => {
                setActionsOpen(false);
                void Clipboard.setStringAsync(copyText);
              }}
              style={styles.action}
            >
              <Image
                contentFit="contain"
                source="sf:doc.on.doc"
                style={styles.actionIcon}
                tintColor={styles.actionLabel.color}
              />
              <Text allowFontScaling style={styles.actionLabel}>
                복사
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="메시지 편집"
              accessibilityRole="button"
              onPress={() => {
                setActionsOpen(false);
                void onEditMessage?.(copyText);
              }}
              style={styles.action}
            >
              <Image
                contentFit="contain"
                source="sf:pencil"
                style={styles.actionIcon}
                tintColor={styles.actionLabel.color}
              />
              <Text allowFontScaling style={styles.actionLabel}>
                편집
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

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
  date: { color: theme.colors.textMuted, fontSize: 12 },
  metadata: { alignItems: 'center', flexDirection: 'row', gap: theme.spacing.xs },
  copyButton: {
    alignItems: 'center',
    height: theme.interaction.minTouchTarget,
    justifyContent: 'center',
    width: theme.interaction.minTouchTarget,
  },
  copyIcon: { height: 18, width: 18 },
  actionsBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.32)',
    flex: 1,
    justifyContent: 'center',
    padding: theme.spacing.xl,
  },
  actionsDismiss: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  actionsMenu: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderCurve: 'continuous',
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 340,
    overflow: 'hidden',
    width: '88%',
  },
  actionsDate: {
    color: theme.colors.textMuted,
    fontSize: 14,
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.lg,
  },
  action: {
    alignItems: 'center',
    borderColor: theme.colors.border,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: theme.spacing.md,
    minHeight: 56,
    paddingHorizontal: theme.spacing.xl,
  },
  actionIcon: { height: 22, width: 22 },
  actionLabel: { color: theme.colors.text, fontSize: 17 },
  products: { marginHorizontal: -theme.spacing.lg, width: 'auto' },
  productsContent: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
}));

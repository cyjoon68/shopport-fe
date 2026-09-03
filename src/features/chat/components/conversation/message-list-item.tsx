import {
  type MenuAction,
  type MenuComponentRef,
  MenuView,
  type NativeActionEvent,
} from '@expo/ui/community/menu';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import {
  type AccessibilityActionEvent,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { PlatformIcon, platformIconSources } from '@/shared/components';

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
  const userMenuRef = useRef<MenuComponentRef>(null);
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
  const date = message.createdAt ? formatMessageDate(message.createdAt) : undefined;
  const userMenuActions: MenuAction[] = [
    ...(date && Platform.OS === 'android'
      ? [{ attributes: { disabled: true }, id: 'date', title: date }]
      : []),
    { id: 'copy', image: platformIconSources.copy, title: '복사' },
    { id: 'edit', image: platformIconSources.edit, title: '편집' },
  ];
  const handleUserMenuAction = ({ nativeEvent }: NativeActionEvent): void => {
    if (nativeEvent.event === 'copy') void Clipboard.setStringAsync(copyText);
    if (nativeEvent.event === 'edit') void onEditMessage?.(copyText);
  };
  const handleUserMenuAccessibilityAction = ({
    nativeEvent,
  }: AccessibilityActionEvent): void => {
    if (nativeEvent.actionName === 'activate') userMenuRef.current?.show();
  };
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
        <MenuView
          actions={userMenuActions}
          onPressAction={handleUserMenuAction}
          ref={userMenuRef}
          shouldOpenOnLongPress
          style={styles.userMenu}
          title={date ?? ''}
        >
          <View
            accessible
            {...(Platform.OS === 'android'
              ? {
                  accessibilityActions: messageAccessibilityActions,
                  onAccessibilityAction: handleUserMenuAccessibilityAction,
                }
              : {})}
            accessibilityHint="길게 눌러 메시지 작업 열기"
            accessibilityLabel={transcriptText}
            accessibilityRole="button"
            style={styles.bubble}
          >
            <Text allowFontScaling maxFontSizeMultiplier={2.5} style={styles.text}>
              {transcriptText}
            </Text>
          </View>
        </MenuView>
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
          {date ? (
            <Text allowFontScaling style={styles.date}>
              {date}
            </Text>
          ) : null}
          <Pressable
            accessibilityLabel="답변 복사"
            accessibilityRole="button"
            onPress={() => void Clipboard.setStringAsync(copyText)}
            style={styles.copyButton}
          >
            <PlatformIcon color={styles.date.color} name="copy" size={18} />
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
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    variants: {
      role: {
        user: { backgroundColor: theme.colors.primary, maxWidth: '100%' },
        assistant: { backgroundColor: theme.colors.surface, maxWidth: '88%' },
      },
    },
  },
  userMenu: { alignSelf: 'flex-end', maxWidth: '88%' },
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
  date: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
  metadata: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: theme.spacing.xs,
    marginTop: -theme.spacing.sm,
  },
  copyButton: {
    alignItems: 'center',
    height: theme.interaction.minTouchTarget,
    justifyContent: 'flex-start',
    width: theme.interaction.minTouchTarget,
  },
  products: { marginHorizontal: -theme.spacing.lg, width: 'auto' },
  productsContent: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
  },
}));

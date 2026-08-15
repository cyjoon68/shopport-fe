import { ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { StyleSheet } from 'react-native-unistyles';
import { ProductCard } from '@/features/catalog/product-card';
import { AskUserCard } from './ask-user-card';
import { activeAskUserRequest } from './message-model';
import type { DisplayMessage, DisplayTool } from './message-model';

export {
  activeAskUserRequest,
  fromHistoricalMessage,
  fromLiveMessage,
  mergeMessages,
} from './message-model';
export type { DisplayMessage } from './message-model';

type MessageListProps = Readonly<{
  answerDisabled: boolean;
  messages: ReadonlyArray<DisplayMessage>;
  onAnswer: (label: string) => Promise<void>;
}>;

const toolStatusLabel = (tool: DisplayTool): string => {
  if (tool.status === 'COMPLETED') return `${tool.name} 완료`;
  if (tool.status === 'FAILED') return `${tool.name} 실패`;
  return `${tool.name} 실행 중`;
};

const MessageRow = ({
  activeAskUserId,
  answerDisabled,
  message,
  onAnswer,
}: Readonly<{
  activeAskUserId: string | null;
  answerDisabled: boolean;
  message: DisplayMessage;
  onAnswer: (label: string) => Promise<void>;
}>) => {
  styles.useVariants({ role: message.role });
  return (
    <View
      accessibilityLabel={message.role === 'user' ? '내 메시지' : 'Shopport 답변'}
      style={styles.row}
    >
      {message.text ? (
        <View style={styles.bubble}>
          <Text
            allowFontScaling
            maxFontSizeMultiplier={2.5}
            selectable
            style={styles.text}
          >
            {message.text}
          </Text>
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
      {message.askUsers.map(({ id, request }) => (
        <AskUserCard
          disabled={answerDisabled || id !== activeAskUserId}
          key={id}
          onSelect={onAnswer}
          request={request}
        />
      ))}
      {message.tools
        .filter((tool) => !message.askUsers.some(({ id }) => id === tool.id))
        .map((tool) => (
          <Text accessibilityLiveRegion="polite" key={tool.id} style={styles.partStatus}>
            {toolStatusLabel(tool)}
          </Text>
        ))}
      {message.products.length ? (
        <ScrollView
          accessibilityLabel="추천 상품"
          contentContainerStyle={styles.products}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {message.products.map((product) => (
            <ProductCard compact key={product.id} product={product} />
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
};

export const MessageList = ({ answerDisabled, messages, onAnswer }: MessageListProps) => {
  const activeAskUserId = activeAskUserRequest(messages)?.id ?? null;
  return (
    <FlashList
      contentContainerStyle={styles.list}
      data={messages}
      keyExtractor={(message) => message.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => (
        <MessageRow
          activeAskUserId={activeAskUserId}
          answerDisabled={answerDisabled}
          message={item}
          onAnswer={onAnswer}
        />
      )}
    />
  );
};

const styles = StyleSheet.create((theme) => ({
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
  products: { gap: theme.spacing.md, paddingRight: theme.spacing.lg },
}));

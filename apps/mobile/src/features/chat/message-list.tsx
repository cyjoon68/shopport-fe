import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import type { UIMessage } from '@tanstack/ai-react';
import { StyleSheet } from 'react-native-unistyles';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import { ProductCard } from '@/features/catalog/product-card';
import { productsFromToolResult } from '@/features/catalog/product-model';

type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

type MessageListProps = Readonly<{
  historical: ReadonlyArray<HistoricalMessage>;
  messages: ReadonlyArray<UIMessage>;
}>;

type DisplayMessage = Readonly<{
  id: string;
  role: 'user' | 'assistant';
  text: string;
  products: ReturnType<typeof productsFromToolResult>;
}>;

const fromLiveMessage = (message: UIMessage): DisplayMessage => ({
  id: message.id,
  role: message.role === 'user' ? 'user' : 'assistant',
  text: message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join(''),
  products: message.parts.flatMap((part) =>
    part.type === 'tool-result' ? productsFromToolResult(part.content) : [],
  ),
});

const fromHistoricalMessage = (message: HistoricalMessage): DisplayMessage => ({
  id: message.id,
  role: message.role === 'USER' ? 'user' : 'assistant',
  text: message.parts
    .flatMap((part) => (part.__typename === 'TextMessagePart' ? [part.text] : []))
    .join(''),
  products: [],
});

const MessageRow = ({ message }: Readonly<{ message: DisplayMessage }>) => {
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

export const MessageList = ({ historical, messages }: MessageListProps) => {
  const data = useMemo(
    () =>
      messages.length
        ? messages.map(fromLiveMessage)
        : historical.map(fromHistoricalMessage),
    [historical, messages],
  );
  return (
    <FlashList
      contentContainerStyle={styles.list}
      data={data}
      keyExtractor={(message) => message.id}
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => <MessageRow message={item} />}
    />
  );
};

const styles = StyleSheet.create((theme) => ({
  list: { paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md },
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
  products: { gap: theme.spacing.md, paddingRight: theme.spacing.lg },
}));

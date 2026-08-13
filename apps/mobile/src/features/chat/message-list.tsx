import { useMemo } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import type { UIMessage } from '@tanstack/ai-react';
import { StyleSheet } from 'react-native-unistyles';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import { ProductCard } from '@/features/catalog/product-card';
import {
  productFromFragment,
  productsFromToolResult,
} from '@/features/catalog/product-model';
import type { CachedProduct } from '@/shared/storage/database';
import { messageIdentity } from './message-id';

type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

type MessageListProps = Readonly<{
  historical: ReadonlyArray<HistoricalMessage>;
  messages: ReadonlyArray<UIMessage>;
}>;

type DisplayImage = Readonly<{
  id: string;
  status: 'PENDING_UPLOAD' | 'PROCESSING' | 'READY' | 'REJECTED';
  url: string | null;
}>;

type DisplayTool = Readonly<{
  id: string;
  name: string;
  status: 'STARTED' | 'COMPLETED' | 'FAILED';
}>;

export type DisplayMessage = Readonly<{
  id: string;
  images: ReadonlyArray<DisplayImage>;
  products: ReadonlyArray<CachedProduct>;
  role: 'user' | 'assistant';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  text: string;
  tools: ReadonlyArray<DisplayTool>;
}>;

const uniqueById = <T extends Readonly<{ id: string }>>(
  values: ReadonlyArray<T>,
): Array<T> => Array.from(new Map(values.map((value) => [value.id, value])).values());

const imageUrl = (part: Extract<UIMessage['parts'][number], { type: 'image' }>) =>
  part.source.type === 'url'
    ? part.source.value
    : `data:${part.source.mimeType};base64,${part.source.value}`;

export const fromLiveMessage = (message: UIMessage): DisplayMessage => {
  const tools: Array<DisplayTool> = [];
  for (const part of message.parts) {
    if (part.type === 'tool-call') {
      tools.push({
        id: part.id,
        name: part.name,
        status:
          part.state === 'complete'
            ? 'COMPLETED'
            : part.state === 'error'
              ? 'FAILED'
              : 'STARTED',
      });
    }
    if (part.type === 'tool-result' && !tools.some(({ id }) => id === part.toolCallId)) {
      tools.push({
        id: part.toolCallId,
        name: '상품 검색',
        status:
          part.state === 'error'
            ? 'FAILED'
            : part.state === 'complete'
              ? 'COMPLETED'
              : 'STARTED',
      });
    }
  }
  return {
    id: messageIdentity('live', message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    status: tools.some(({ status }) => status === 'FAILED')
      ? 'FAILED'
      : tools.some(({ status }) => status === 'STARTED')
        ? 'PENDING'
        : 'COMPLETED',
    text: message.parts
      .filter((part) => part.type === 'text')
      .map((part) => part.content)
      .join(''),
    images: message.parts.flatMap((part, index) =>
      part.type === 'image'
        ? [
            {
              id: `${message.id}:image:${index}`,
              status: 'READY' as const,
              url: imageUrl(part),
            },
          ]
        : [],
    ),
    products: message.parts.flatMap((part) =>
      part.type === 'tool-result' ? productsFromToolResult(part.content) : [],
    ),
    tools,
  };
};

export const fromHistoricalMessage = (message: HistoricalMessage): DisplayMessage => ({
  id: messageIdentity('server', message.id),
  role: message.role === 'USER' ? 'user' : 'assistant',
  status: message.status,
  text: message.parts
    .flatMap((part) => (part.__typename === 'TextMessagePart' ? [part.text] : []))
    .join(''),
  images: message.parts.flatMap((part) =>
    part.__typename === 'ImageMessagePart'
      ? [
          {
            id: part.id,
            status: part.asset.status,
            url: part.asset.url ?? null,
          },
        ]
      : [],
  ),
  products: message.parts.flatMap((part) =>
    part.__typename === 'ProductReferenceMessagePart'
      ? [productFromFragment(part.product)]
      : [],
  ),
  tools: message.parts.flatMap((part) =>
    part.__typename === 'ToolStatusMessagePart'
      ? [{ id: part.id, name: part.toolName, status: part.status }]
      : [],
  ),
});

const mergeDisplayMessage = (
  historical: DisplayMessage,
  live: DisplayMessage,
): DisplayMessage => ({
  ...historical,
  ...live,
  text: live.text || historical.text,
  images: uniqueById([...historical.images, ...live.images]),
  products: uniqueById([...historical.products, ...live.products]),
  tools: uniqueById([...historical.tools, ...live.tools]),
});

export const mergeMessages = (
  historical: ReadonlyArray<HistoricalMessage>,
  live: ReadonlyArray<UIMessage>,
): Array<DisplayMessage> => {
  const merged = historical.map(fromHistoricalMessage);
  const positions = new Map(merged.map((message, index) => [message.id, index]));
  for (const message of live.map(fromLiveMessage)) {
    const position = positions.get(message.id);
    if (position === undefined) {
      positions.set(message.id, merged.length);
      merged.push(message);
    } else {
      const previous = merged[position];
      if (previous) merged[position] = mergeDisplayMessage(previous, message);
    }
  }
  return merged;
};

const toolStatusLabel = (tool: DisplayTool): string => {
  if (tool.status === 'COMPLETED') return `${tool.name} 완료`;
  if (tool.status === 'FAILED') return `${tool.name} 실패`;
  return `${tool.name} 실행 중`;
};

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
      {message.tools.map((tool) => (
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

export const MessageList = ({ historical, messages }: MessageListProps) => {
  const data = useMemo(() => mergeMessages(historical, messages), [historical, messages]);
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
  image: { borderRadius: theme.radii.md, height: 220, width: 220 },
  partStatus: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radii.pill,
    color: theme.colors.textMuted,
    fontSize: 13,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  products: { gap: theme.spacing.md, paddingRight: theme.spacing.lg },
}));

import type { UIMessage } from '@tanstack/ai-react';

import type { RecommendedProduct } from '@/features/catalog/product-model';
import {
  productRecommendationSummariesFromToolResult,
  productsFromToolResult,
  recommendedProductFromFragment,
} from '@/features/catalog/product-model';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import type { CachedProduct } from '@/shared/storage/database';

import { ASK_USER_SKIP_MESSAGE, askUserArgsFromToolPart } from './ask-user';
import { messageIdentity } from './message-id';
import type { AskUserRequest } from './types';

type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

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
  askUsers: ReadonlyArray<Readonly<{ id: string; request: AskUserRequest }>>;
  id: string;
  images: ReadonlyArray<DisplayImage>;
  products: ReadonlyArray<CachedProduct>;
  recommendations: ReadonlyArray<RecommendedProduct>;
  role: 'user' | 'assistant';
  status: 'PENDING' | 'COMPLETED' | 'FAILED';
  text: string;
  tools: ReadonlyArray<DisplayTool>;
}>;

type DisplayMessageMergeCacheEntry = Readonly<{
  historical: DisplayMessage;
  live: DisplayMessage;
  merged: DisplayMessage;
}>;

export type DisplayMessageMergeCache = Map<string, DisplayMessageMergeCacheEntry>;

const visibleMessageText = (text: string): string =>
  text.trim() === ASK_USER_SKIP_MESSAGE ? '' : text;

const uniqueById = <T extends Readonly<{ id: string }>>(
  values: ReadonlyArray<T>,
): Array<T> => Array.from(new Map(values.map((value) => [value.id, value])).values());

const mergeRecommendations = (
  historical: ReadonlyArray<RecommendedProduct>,
  live: ReadonlyArray<RecommendedProduct>,
): Array<RecommendedProduct> => {
  const recommendations = new Map(
    historical.map((recommendation) => [recommendation.product.id, recommendation]),
  );
  live.forEach((recommendation) => {
    const current = recommendations.get(recommendation.product.id);
    if (recommendation.aiSummary || !current)
      recommendations.set(recommendation.product.id, recommendation);
  });
  return [...recommendations.values()];
};

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
  const text = message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.content)
    .join('');
  const products = uniqueById(
    message.parts.flatMap((part) =>
      part.type === 'tool-result' ? productsFromToolResult(part.content) : [],
    ),
  );
  const aiSummaries = new Map(
    message.parts
      .flatMap((part) =>
        part.type === 'tool-result'
          ? productRecommendationSummariesFromToolResult(part.content)
          : [],
      )
      .map(({ productId, aiSummary }) => [productId, aiSummary]),
  );
  return {
    askUsers: message.parts.flatMap((part) => {
      const request = askUserArgsFromToolPart(part);
      return request && part.type === 'tool-call' ? [{ id: part.id, request }] : [];
    }),
    id: messageIdentity('live', message.id),
    role: message.role === 'user' ? 'user' : 'assistant',
    status: tools.some(({ status }) => status === 'FAILED')
      ? 'FAILED'
      : tools.some(({ status }) => status === 'STARTED')
        ? 'PENDING'
        : 'COMPLETED',
    text: visibleMessageText(text),
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
    products,
    recommendations: products.map((product) => ({
      product,
      aiSummary: aiSummaries.get(product.id) ?? null,
    })),
    tools,
  };
};

export const fromHistoricalMessage = (message: HistoricalMessage): DisplayMessage => {
  const text = message.parts
    .flatMap((part) => (part.__typename === 'TextMessagePart' ? [part.text] : []))
    .join('');
  const recommendations = message.parts.flatMap((part) =>
    part.__typename === 'ProductReferenceMessagePart'
      ? [recommendedProductFromFragment(part.product, part.aiSummary)]
      : [],
  );
  return {
    askUsers: message.parts.flatMap((part) =>
      part.__typename === 'AskUserMessagePart'
        ? [
            {
              id: part.id,
              request: {
                allowFreeText: part.allowFreeText,
                options: part.options,
                question: part.question,
              },
            },
          ]
        : [],
    ),
    id: messageIdentity('server', message.id),
    role: message.role === 'USER' ? 'user' : 'assistant',
    status: message.status,
    text: visibleMessageText(text),
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
    products: recommendations.map(({ product }) => product),
    recommendations,
    tools: message.parts.flatMap((part) =>
      part.__typename === 'ToolStatusMessagePart'
        ? [{ id: part.id, name: part.toolName, status: part.status }]
        : [],
    ),
  };
};

const mergeDisplayMessage = (
  historical: DisplayMessage,
  live: DisplayMessage,
): DisplayMessage => ({
  ...historical,
  ...live,
  text: live.text || historical.text,
  images: uniqueById([...historical.images, ...live.images]),
  products: uniqueById([...historical.products, ...live.products]),
  recommendations: mergeRecommendations(historical.recommendations, live.recommendations),
  tools: uniqueById([...historical.tools, ...live.tools]),
  askUsers: live.askUsers.length ? live.askUsers : historical.askUsers,
});

export const mergeDisplayMessages = (
  historical: ReadonlyArray<DisplayMessage>,
  live: ReadonlyArray<DisplayMessage>,
  cache?: DisplayMessageMergeCache,
): Array<DisplayMessage> => {
  const merged = [...historical];
  const positions = new Map(merged.map((message, index) => [message.id, index]));
  const nextCache = cache ? new Map<string, DisplayMessageMergeCacheEntry>() : undefined;
  for (const message of live) {
    const position = positions.get(message.id);
    if (position === undefined) {
      positions.set(message.id, merged.length);
      merged.push(message);
    } else {
      const previous = merged[position];
      if (previous) {
        const cached = cache?.get(message.id);
        const result =
          cached?.historical === previous && cached.live === message
            ? cached.merged
            : mergeDisplayMessage(previous, message);
        merged[position] = result;
        nextCache?.set(message.id, {
          historical: previous,
          live: message,
          merged: result,
        });
      }
    }
  }
  if (cache && nextCache) {
    cache.clear();
    nextCache.forEach((entry, id) => cache.set(id, entry));
  }
  return merged;
};

export const mergeMessages = (
  historical: ReadonlyArray<HistoricalMessage>,
  live: ReadonlyArray<UIMessage>,
): Array<DisplayMessage> =>
  mergeDisplayMessages(historical.map(fromHistoricalMessage), live.map(fromLiveMessage));

export const activeAskUserRequest = (
  messages: ReadonlyArray<DisplayMessage>,
): Readonly<{ id: string; request: AskUserRequest }> | null => {
  const lastMessage = messages.at(-1);
  return lastMessage?.role === 'assistant' ? (lastMessage.askUsers.at(-1) ?? null) : null;
};

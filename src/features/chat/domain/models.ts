import type { UIMessage } from '@tanstack/ai-react';

import { recommendedProductFromFragment } from '@/features/catalog/domain/models';
import {
  productRecommendationSummariesFromToolResult,
  productsFromToolResult,
} from '@/features/catalog/domain/tool-results';
import type { RecommendedProduct } from '@/features/catalog/types';
import type { CachedProduct } from '@/shared/storage/types';

import { ASK_USER_SKIP_MESSAGE, askUserArgsFromToolPart } from '../api/schemas';
import type {
  AskUserRequest,
  DisplayMessage,
  DisplayMessageMergeCache,
  DisplayMessageMergeCacheEntry,
  DisplayTool,
  HistoricalMessage,
} from '../types';
import { messageIdentity } from './message-id';

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
    createdAt: message.createdAt ?? null,
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
    createdAt: new Date(message.createdAt),
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
  createdAt: live.createdAt ?? historical.createdAt ?? null,
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

const cachedProductKeys = [
  'id',
  'title',
  'imageUrl',
  'providerId',
  'providerName',
  'amountMinor',
  'shippingMinor',
  'totalMinor',
  'currency',
  'isAffiliate',
  'isInStock',
  'outboundUrl',
  'deliveryExpectedAt',
  'observedAt',
  'isSaved',
] as const satisfies ReadonlyArray<keyof CachedProduct>;

const hasSameProduct = (left: CachedProduct, right: CachedProduct): boolean =>
  cachedProductKeys.every((key) => left[key] === right[key]);

const hasSameProducts = (
  left: ReadonlyArray<CachedProduct>,
  right: ReadonlyArray<CachedProduct>,
): boolean =>
  left.length === right.length &&
  left.every((product, index) => {
    const other = right[index];
    return other ? hasSameProduct(product, other) : false;
  });

export const hasSameChatScreenProjection = (
  left: ReadonlyArray<DisplayMessage>,
  right: ReadonlyArray<DisplayMessage>,
): boolean =>
  left.length === right.length &&
  left.every((message, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      message.id === other.id &&
      message.role === other.role &&
      hasSameProducts(message.products, other.products) &&
      message.recommendations.length === other.recommendations.length &&
      message.recommendations.every((recommendation, recommendationIndex) => {
        const nextRecommendation = other.recommendations[recommendationIndex];
        return (
          nextRecommendation !== undefined &&
          recommendation.aiSummary === nextRecommendation.aiSummary &&
          hasSameProduct(recommendation.product, nextRecommendation.product)
        );
      })
    );
  });

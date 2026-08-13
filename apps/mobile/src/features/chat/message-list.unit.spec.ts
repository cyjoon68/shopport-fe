import type { UIMessage } from '@tanstack/ai-react';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import { fromHistoricalMessage, mergeMessages } from './message-list';

const product = {
  id: 'product-1',
  title: '텀블러',
  imageUrl: 'https://example.com/product.jpg',
  isAffiliate: false,
  isSaved: true,
  provider: { providerId: 'provider-1', displayName: '판매처' },
  offer: {
    id: 'offer-1',
    isInStock: true,
    deliveryExpectedAt: null,
    observedAt: '2026-08-13T00:00:00.000Z',
    outboundUrl: 'https://example.com/product',
    price: { amountMinor: '10000', currency: 'KRW' },
    shipping: { amountMinor: '0', currency: 'KRW' },
    total: { amountMinor: '10000', currency: 'KRW' },
  },
};

type HistoricalMessage = NonNullable<
  ConversationQuery['conversation']
>['messages'][number];

const historical = {
  id: 'message-1',
  role: 'ASSISTANT',
  status: 'COMPLETED',
  createdAt: '2026-08-13T00:00:00.000Z',
  parts: [
    { __typename: 'TextMessagePart', id: 'part-text', text: '추천 결과' },
    {
      __typename: 'ImageMessagePart',
      id: 'part-image',
      asset: { id: 'asset-1', status: 'READY', url: 'https://example.com/image.jpg' },
    },
    { __typename: 'ProductReferenceMessagePart', id: 'part-product', product },
    {
      __typename: 'ToolStatusMessagePart',
      id: 'part-tool',
      toolName: 'search_products',
      status: 'COMPLETED',
    },
  ],
} as HistoricalMessage;

describe('historical message parts', () => {
  it('renders text, image, product reference and tool status models', () => {
    expect(fromHistoricalMessage(historical)).toEqual(
      expect.objectContaining({
        text: '추천 결과',
        images: [expect.objectContaining({ id: 'part-image', status: 'READY' })],
        products: [expect.objectContaining({ id: 'product-1' })],
        tools: [expect.objectContaining({ id: 'part-tool', status: 'COMPLETED' })],
      }),
    );
  });

  it('deduplicates server and persisted live messages by stable ID', () => {
    const live: UIMessage = {
      id: 'message-1',
      role: 'assistant',
      parts: [{ type: 'text', content: '완료된 추천 결과' }],
    };
    const merged = mergeMessages([historical], [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        text: '완료된 추천 결과',
        products: [expect.anything()],
      }),
    );
  });
});

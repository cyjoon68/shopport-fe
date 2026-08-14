import type { UIMessage } from '@tanstack/ai-react';
import type { ConversationQuery } from '@/graphql/generated/graphql';
import {
  activeAskUserRequest,
  fromHistoricalMessage,
  mergeMessages,
} from './message-list';
import {
  createStableChatMessageId,
  createUuidV7,
  isStableChatMessageId,
  messageIdentity,
} from './message-id';

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
  id: '0198a122-0c00-7000-8000-000000000001',
  role: 'ASSISTANT',
  status: 'COMPLETED',
  createdAt: '2026-08-13T00:00:00.000Z',
  parts: [
    { __typename: 'TextMessagePart', id: 'part-text', text: '추천 결과' },
    {
      __typename: 'AskUserMessagePart',
      id: 'part-question',
      question: '예산은 어느 정도인가요?',
      options: [
        { id: 'under-3', label: '3만원 이하' },
        { id: 'under-5', label: '5만원 이하' },
      ],
      allowFreeText: true,
    },
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
    const message = fromHistoricalMessage(historical);
    expect(message.text).toBe('추천 결과');
    expect(message.askUsers[0]?.id).toBe('part-question');
    expect(message.askUsers[0]?.request.question).toBe('예산은 어느 정도인가요?');
    expect(message.images[0]?.id).toBe('part-image');
    expect(message.images[0]?.status).toBe('READY');
    expect(message.products[0]?.id).toBe('product-1');
    expect(message.tools[0]?.id).toBe('part-tool');
    expect(message.tools[0]?.status).toBe('COMPLETED');
    expect(activeAskUserRequest([message])?.request.allowFreeText).toBe(true);
    expect(
      activeAskUserRequest([
        message,
        { ...message, askUsers: [], id: 'next-user', role: 'user' },
      ]),
    ).toBeNull();
  });

  it('deduplicates server and persisted live messages by stable ID', () => {
    const live: UIMessage = {
      id: '0198a122-0c00-7000-8000-000000000001',
      role: 'assistant',
      parts: [
        { type: 'text', content: '완료된 추천 결과' },
        {
          type: 'tool-call',
          id: 'live-question',
          name: 'askUser',
          arguments: JSON.stringify({
            question: '예산은 어느 정도인가요?',
            options: [
              { id: 'under-3', label: '3만원 이하' },
              { id: 'under-5', label: '5만원 이하' },
            ],
            allowFreeText: true,
          }),
          state: 'input-complete',
        },
      ],
    };
    const merged = mergeMessages([historical], [live]);
    expect(merged).toHaveLength(1);
    expect(merged[0]).toEqual(
      expect.objectContaining({
        text: '완료된 추천 결과',
        products: [expect.anything()],
      }),
    );
    expect(merged[0]?.askUsers).toHaveLength(1);
    expect(merged[0]?.askUsers[0]?.id).toBe('live-question');
  });

  it('requires canonical UUIDs for cross-source identity and isolates legacy IDs', () => {
    expect(isStableChatMessageId('0198a122-0c00-7000-8000-000000000001')).toBe(true);
    expect(isStableChatMessageId('0198a122-0c00-4000-8000-000000000001')).toBe(false);
    expect(isStableChatMessageId('msg-legacy')).toBe(false);
    expect(messageIdentity('server', 'msg-legacy')).toBe('server:msg-legacy');
    expect(messageIdentity('live', 'msg-legacy')).toBe('live:msg-legacy');
  });

  it('creates UUIDv7 IDs with RFC variants and only deduplicates canonical IDs', () => {
    const id = createUuidV7(0x0198a1220c00, () => new Uint8Array(16).fill(0));
    expect(id).toBe('0198a122-0c00-7000-8000-000000000000');
    expect(isStableChatMessageId(id)).toBe(true);
    expect(isStableChatMessageId(createStableChatMessageId())).toBe(true);
    const v4 = '0198a122-0c00-4000-8000-000000000001';
    expect(messageIdentity('server', v4)).toBe(`server:${v4}`);
    expect(messageIdentity('live', v4)).toBe(`live:${v4}`);
    expect(messageIdentity('server', id)).toBe(id);
    expect(messageIdentity('live', id)).toBe(id);
  });
});

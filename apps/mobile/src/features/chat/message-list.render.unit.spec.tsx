import { render } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { View as mockNativeView } from 'react-native';
import type { DisplayMessage } from './message-list';

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    renderItem,
  }: {
    data: ReadonlyArray<DisplayMessage>;
    renderItem: ({ item }: { item: DisplayMessage }) => ReactNode;
  }) =>
    mockCreateElement(
      mockNativeView,
      null,
      data.map((item) =>
        mockCreateElement(mockNativeView, { key: item.id }, renderItem({ item })),
      ),
    ),
}));

import { MessageList } from './message-list';

const message = {
  askUsers: [],
  id: 'assistant-1',
  images: [],
  products: [
    {
      amountMinor: '3000',
      currency: 'KRW',
      deliveryExpectedAt: null,
      id: 'product-1',
      imageUrl: 'https://example.com/product.jpg',
      isAffiliate: false,
      isInStock: true,
      isSaved: false,
      observedAt: '2026-08-17T00:00:00.000Z',
      outboundUrl: 'https://example.com/product',
      providerId: 'oliveyoung',
      providerName: '올리브영',
      shippingMinor: '0',
      title: '립밤',
      totalMinor: '3000',
    },
  ],
  recommendations: [],
  role: 'assistant',
  status: 'COMPLETED',
  text: '상품을 찾았어요.',
  tools: [{ id: 'tool-1', name: 'searchProducts', status: 'COMPLETED' }],
} satisfies DisplayMessage;

describe('chat message list', () => {
  it('does not expose internal tool status to the user', () => {
    const screen = render(<MessageList messages={[message]} />);

    expect(screen.getByText('상품을 찾았어요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('추천 상품')).toBeOnTheScreen();
    expect(screen.getByText('자세히 보기')).toBeOnTheScreen();
    expect(screen.queryByText('searchProducts 완료')).toBeNull();
  });

  it('keeps an askUser question as a single assistant line without inline options', () => {
    const screen = render(
      <MessageList
        messages={[
          {
            ...message,
            askUsers: [
              {
                id: 'question-1',
                request: {
                  allowFreeText: false,
                  options: [
                    { id: 'black', label: '검정' },
                    { id: 'white', label: '흰색' },
                  ],
                  question: '어떤 색이 좋아요?',
                },
              },
            ],
            products: [],
            text: '어떤 색이 좋아요?',
          },
        ]}
      />,
    );

    expect(screen.getAllByText('어떤 색이 좋아요?')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: '검정' })).toBeNull();
  });
});

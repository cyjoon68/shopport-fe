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
  products: [],
  role: 'assistant',
  status: 'COMPLETED',
  text: '상품을 찾았어요.',
  tools: [{ id: 'tool-1', name: 'searchProducts', status: 'COMPLETED' }],
} satisfies DisplayMessage;

describe('chat message list', () => {
  it('does not expose internal tool status to the user', () => {
    const screen = render(
      <MessageList
        answerDisabled={false}
        messages={[message]}
        onAnswer={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText('상품을 찾았어요.')).toBeOnTheScreen();
    expect(screen.queryByText('searchProducts 완료')).toBeNull();
  });
});

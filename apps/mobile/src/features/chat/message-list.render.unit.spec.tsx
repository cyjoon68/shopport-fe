import { render } from '@testing-library/react-native';
import {
  createElement as mockCreateElement,
  forwardRef as mockForwardRef,
  type ReactElement,
  type ReactNode,
  useImperativeHandle as mockUseImperativeHandle,
} from 'react';
import { View as mockNativeView } from 'react-native';

import type { DisplayMessage } from './message-model';

type FlashListProps = Readonly<{
  data: ReadonlyArray<DisplayMessage>;
  maintainVisibleContentPosition?: Readonly<{
    autoscrollToBottomThreshold?: number;
    startRenderingFromBottom?: boolean;
  }>;
  renderItem: ({ item }: { item: DisplayMessage }) => ReactNode;
}>;

let mockFlashListProps: FlashListProps | null = null;
const mockScrollToEnd = jest.fn();

jest.mock('@shopify/flash-list', () => ({
  FlashList: mockForwardRef((props: FlashListProps, ref) => {
    mockFlashListProps = props;
    mockUseImperativeHandle(ref, () => ({ scrollToEnd: mockScrollToEnd }));
    return mockCreateElement(
      mockNativeView,
      null,
      props.data.map((item) =>
        mockCreateElement(mockNativeView, { key: item.id }, props.renderItem({ item })),
      ),
    );
  }),
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
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlashListProps = null;
  });

  it('does not expose internal tool status to the user', () => {
    const screen = render(<MessageList messages={[message]} />);

    expect(screen.getByText('상품을 찾았어요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('추천 상품')).toBeOnTheScreen();
    expect(screen.getByText('자세히 보기')).toBeOnTheScreen();
    expect(screen.queryByText('searchProducts 완료')).toBeNull();
  });

  it('follows streamed responses near the bottom without moving existing messages', () => {
    render(<MessageList messages={[message]} />);

    expect(mockScrollToEnd).not.toHaveBeenCalled();
    expect(mockFlashListProps?.maintainVisibleContentPosition).toEqual({
      autoscrollToBottomThreshold: 0.2,
      startRenderingFromBottom: true,
    });
  });

  it('animates only the latest message while a response is being generated', () => {
    const userMessage = {
      ...message,
      id: 'user-1',
      products: [],
      role: 'user' as const,
      text: '립밤 찾아줘',
      tools: [],
    };
    render(<MessageList isGenerating messages={[message, userMessage]} />);

    const assistantRow = mockFlashListProps?.renderItem({
      item: message,
    }) as ReactElement<{
      animate: boolean;
    }>;
    const userRow = mockFlashListProps?.renderItem({
      item: userMessage,
    }) as ReactElement<{
      animate: boolean;
    }>;

    expect(assistantRow.props.animate).toBe(false);
    expect(userRow.props.animate).toBe(true);
  });

  it('scrolls to a newly sent user message once', () => {
    const screen = render(<MessageList messages={[message]} />);
    const userMessage = {
      ...message,
      id: 'user-1',
      products: [],
      role: 'user' as const,
      text: '립밤 찾아줘',
      tools: [],
    };

    screen.rerender(
      <MessageList
        messages={[
          message,
          userMessage,
          { ...message, id: 'assistant-2', text: '찾아볼게요.' },
        ]}
      />,
    );

    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
    expect(mockScrollToEnd).toHaveBeenLastCalledWith({ animated: true });

    screen.rerender(
      <MessageList
        messages={[
          message,
          userMessage,
          { ...message, id: 'assistant-2', text: '상품을 찾아볼게요.' },
        ]}
      />,
    );

    expect(mockScrollToEnd).toHaveBeenCalledTimes(1);
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

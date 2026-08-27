import { fireEvent, render } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import {
  createElement as mockCreateElement,
  forwardRef as mockForwardRef,
  type ReactElement,
  type ReactNode,
  useImperativeHandle as mockUseImperativeHandle,
} from 'react';
import { View as mockNativeView } from 'react-native';

import type { DisplayMessage } from '../../../types';

type MockMenuProps = Readonly<{
  actions: ReadonlyArray<Readonly<{ id?: string; image?: unknown; title: string }>>;
  children?: ReactNode;
  onPressAction?: (event: Readonly<{ nativeEvent: Readonly<{ event: string }> }>) => void;
  shouldOpenOnLongPress?: boolean;
  title?: string;
}>;

let mockMenuProps: MockMenuProps | undefined;

jest.mock('@expo/ui/community/menu', () => ({
  MenuView: (props: MockMenuProps) => {
    mockMenuProps = props;
    return mockCreateElement(mockNativeView, null, props.children);
  },
}));

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(() => Promise.resolve()),
}));

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

import { MessageList } from '../message-list';

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
    mockMenuProps = undefined;
  });

  it('does not expose internal tool status to the user', () => {
    const screen = render(<MessageList messages={[message]} />);

    expect(screen.getByText('상품을 찾았어요.')).toBeOnTheScreen();
    expect(screen.getByLabelText('추천 상품')).toBeOnTheScreen();
    expect(screen.getByText('자세히 보기')).toBeOnTheScreen();
    expect(screen.queryByText('searchProducts 완료')).toBeNull();
  });

  it('shows an assistant timestamp through the minute without the current year', () => {
    const currentYear = new Date().getFullYear();
    const screen = render(
      <MessageList
        messages={[
          {
            ...message,
            createdAt: new Date(currentYear, 7, 19, 20, 48),
          },
        ]}
      />,
    );

    expect(screen.getByText('8월 19일 오후 8시 48분')).toBeOnTheScreen();
  });

  it('keeps assistant metadata nearly flush with its bubble', () => {
    const currentYear = new Date().getFullYear();
    const screen = render(
      <MessageList
        messages={[
          {
            ...message,
            createdAt: new Date(currentYear, 7, 19, 20, 48),
          },
        ]}
      />,
    );

    expect(screen.getByText('8월 19일 오후 8시 48분').parent?.parent).toHaveStyle({
      alignItems: 'flex-start',
      marginTop: -12,
    });
    expect(screen.getByLabelText('답변 복사')).toHaveStyle({
      height: 44,
      justifyContent: 'flex-start',
    });
  });

  it('includes the year in an assistant timestamp from another year', () => {
    const previousYear = new Date().getFullYear() - 1;
    const screen = render(
      <MessageList
        messages={[
          {
            ...message,
            createdAt: new Date(previousYear, 0, 2, 9, 5),
          },
        ]}
      />,
    );

    expect(screen.getByText(`${previousYear}년 1월 2일 오전 9시 5분`)).toBeOnTheScreen();
  });

  it('copies the assistant bubble text from a regular button', () => {
    const screen = render(<MessageList messages={[message]} />);

    fireEvent.press(screen.getByLabelText('답변 복사'));

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('상품을 찾았어요.');
  });

  it('uses a dated native long-press menu for user actions', () => {
    const currentYear = new Date().getFullYear();
    render(
      <MessageList
        messages={[
          {
            ...message,
            createdAt: new Date(currentYear, 7, 19, 20, 48),
            id: 'user-actions',
            products: [],
            role: 'user',
            text: '립밤 찾아줘',
            tools: [],
          },
        ]}
      />,
    );

    expect(mockMenuProps).toMatchObject({
      actions: [
        { id: 'copy', image: 'doc.on.doc', title: '복사' },
        { id: 'edit', image: 'pencil', title: '편집' },
      ],
      shouldOpenOnLongPress: true,
      title: '8월 19일 오후 8시 48분',
    });
  });

  it('keeps the native user-menu trigger accessible', () => {
    const screen = render(
      <MessageList
        messages={[
          {
            ...message,
            id: 'user-accessibility-actions',
            products: [],
            role: 'user',
            text: '립밤 찾아줘',
            tools: [],
          },
        ]}
      />,
    );

    expect(screen.getByRole('button', { name: '립밤 찾아줘' })).toHaveProp(
      'accessibilityHint',
      '길게 눌러 메시지 작업 열기',
    );
  });

  it('copies the user bubble text from its native menu', () => {
    render(
      <MessageList
        messages={[
          {
            ...message,
            id: 'user-copy',
            products: [],
            role: 'user',
            text: '립밤 찾아줘',
            tools: [],
          },
        ]}
      />,
    );

    mockMenuProps?.onPressAction?.({ nativeEvent: { event: 'copy' } });

    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('립밤 찾아줘');
  });

  it('forwards the user bubble text from its native edit action', () => {
    const onEditMessage = jest.fn(() => Promise.resolve());
    render(
      <MessageList
        messages={[
          {
            ...message,
            id: 'user-edit',
            products: [],
            role: 'user',
            text: '립밤 찾아줘',
            tools: [],
          },
        ]}
        onEditMessage={onEditMessage}
      />,
    );

    mockMenuProps?.onPressAction?.({ nativeEvent: { event: 'edit' } });

    expect(onEditMessage).toHaveBeenCalledWith('립밤 찾아줘');
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

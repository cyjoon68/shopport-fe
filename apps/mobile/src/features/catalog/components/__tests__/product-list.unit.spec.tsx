import { useQuery } from '@apollo/client/react';
import { render, waitFor } from '@testing-library/react-native';
import {
  createElement as mockCreateElement,
  Fragment as mockFragment,
  type ReactNode,
} from 'react';

import { FoundProductsDocument } from '@/graphql/generated/graphql';
import { readCachedChatMessages } from '@/shared/storage';
import type { CachedProduct } from '@/shared/storage/types';

import type { RecommendedProduct } from '../../types';
import { ProductList } from '../product-list';

type FlashListProps = Readonly<{
  data?: ReadonlyArray<RecommendedProduct>;
  numColumns?: number;
  renderItem?: (props: { item: RecommendedProduct }) => ReactNode;
}>;

let mockFlashListProps: FlashListProps | null = null;

type ProductCardProps = Readonly<{
  horizontal?: boolean;
  product: CachedProduct;
}>;

let mockProductCardProps: ProductCardProps | null = null;
const mockedUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockedReadCachedChatMessages = readCachedChatMessages as jest.MockedFunction<
  typeof readCachedChatMessages
>;

const product = {
  id: 'product-1',
  title: '립밤',
  imageUrl: 'https://example.com/lipbalm.jpg',
  providerId: 'oliveyoung',
  providerName: '올리브영',
  amountMinor: '3000',
  shippingMinor: '0',
  totalMinor: '3000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  outboundUrl: 'https://example.com/lipbalm',
  deliveryExpectedAt: null,
  observedAt: '2026-08-17T00:00:00.000Z',
  isSaved: false,
} satisfies CachedProduct;

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => ({ data: undefined, fetchMore: jest.fn() })),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: (props: FlashListProps) => {
    mockFlashListProps = props;
    return mockCreateElement(
      mockFragment,
      null,
      props.data?.map((item) =>
        mockCreateElement(
          mockFragment,
          { key: item.product.id },
          props.renderItem?.({ item }),
        ),
      ),
    );
  },
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage', () => ({
  readCachedChatMessages: jest.fn(() => Promise.resolve([])),
}));

jest.mock('@shopport/ui', () => ({
  EmptyState: () => null,
  Screen: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('../product-card', () => ({
  ProductCard: (props: ProductCardProps) => {
    mockProductCardProps = props;
    return null;
  },
}));

const firstProductCardProps = (): ProductCardProps => {
  if (!mockProductCardProps) throw new Error('상품 카드가 없습니다.');
  return mockProductCardProps;
};

describe('found products layout', () => {
  beforeEach(() => {
    mockFlashListProps = null;
    mockProductCardProps = null;
    mockedReadCachedChatMessages.mockReset();
    mockedReadCachedChatMessages.mockImplementation(() => new Promise(() => undefined));
  });

  it('renders products in a one-column list', () => {
    render(<ProductList />);

    expect(mockFlashListProps?.numColumns).toBe(1);
  });

  it('loads products from all conversations by default', () => {
    render(<ProductList />);

    expect(mockedUseQuery).toHaveBeenLastCalledWith(
      FoundProductsDocument,
      expect.objectContaining({ skip: false }),
    );
  });

  it('does not load other conversations inside a conversation product tab', () => {
    render(<ProductList scope="conversation" />);

    expect(mockedUseQuery).toHaveBeenLastCalledWith(
      FoundProductsDocument,
      expect.objectContaining({ skip: true }),
    );
  });

  it('includes product cards cached from other conversations in the global list', async () => {
    mockedReadCachedChatMessages.mockResolvedValue([
      {
        id: 'message-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            content: JSON.stringify({
              kind: 'product_cards',
              products: [
                {
                  id: product.id,
                  title: product.title,
                  imageUrl: product.imageUrl,
                  isAffiliate: product.isAffiliate,
                  isSaved: product.isSaved,
                  provider: {
                    providerId: product.providerId,
                    displayName: product.providerName,
                  },
                  offer: {
                    id: product.id,
                    price: {
                      amountMinor: product.amountMinor,
                      currency: product.currency,
                    },
                    shipping: {
                      amountMinor: product.shippingMinor,
                      currency: product.currency,
                    },
                    total: {
                      amountMinor: product.totalMinor,
                      currency: product.currency,
                    },
                    isInStock: product.isInStock,
                    deliveryExpectedAt: product.deliveryExpectedAt,
                    observedAt: product.observedAt,
                    outboundUrl: product.outboundUrl,
                  },
                },
              ],
            }),
          },
        ],
      },
    ] as never);

    render(<ProductList />);

    await waitFor(() => expect(firstProductCardProps().product).toEqual(product));
  });

  it('uses the horizontal card and renders the current summary outside it in Product tab', () => {
    const screen = render(
      <ProductList
        conversationRecommendations={[
          { product, aiSummary: '이전 요약' },
          { product, aiSummary: '가장 최근 요약' },
        ]}
        presentation="recommendations"
        scope="conversation"
      />,
    );

    expect(firstProductCardProps()).toEqual(
      expect.objectContaining({
        horizontal: true,
        product,
      }),
    );
    expect(screen.getByText('AI 요약')).toBeOnTheScreen();
    expect(screen.getByText('가장 최근 요약').props.numberOfLines).toBe(3);
  });

  it('keeps catalog cards free of recommendation summaries', () => {
    const screen = render(
      <ProductList
        conversationRecommendations={[{ product, aiSummary: '추천 이유' }]}
        scope="conversation"
      />,
    );

    expect(firstProductCardProps()).toEqual(
      expect.objectContaining({ horizontal: false, product }),
    );
    expect(screen.queryByText('AI 요약')).toBeNull();
  });
});

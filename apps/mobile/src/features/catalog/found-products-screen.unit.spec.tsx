import {
  Fragment as mockFragment,
  createElement as mockCreateElement,
  type ReactNode,
} from 'react';
import { render } from '@testing-library/react-native';
import { FoundProductsContent } from './found-products-screen';
import type { RecommendedProduct } from './product-model';
import type { CachedProduct } from '@/shared/storage/database';

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

jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@shopport/ui', () => ({
  EmptyState: () => null,
  Screen: ({ children }: { children: ReactNode }) => children,
}));

jest.mock('./product-card', () => ({
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
  });

  it('renders products in a one-column list', () => {
    render(<FoundProductsContent />);

    expect(mockFlashListProps?.numColumns).toBe(1);
  });

  it('uses the horizontal card and renders the current summary outside it in Product tab', () => {
    const screen = render(
      <FoundProductsContent
        conversationRecommendations={[
          { product, aiSummary: '이전 요약' },
          { product, aiSummary: '가장 최근 요약' },
        ]}
        presentation="recommendations"
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
      <FoundProductsContent
        conversationRecommendations={[{ product, aiSummary: '추천 이유' }]}
      />,
    );

    expect(firstProductCardProps()).toEqual(
      expect.objectContaining({ horizontal: false, product }),
    );
    expect(screen.queryByText('AI 요약')).toBeNull();
  });
});

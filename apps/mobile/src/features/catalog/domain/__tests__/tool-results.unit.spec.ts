import {
  productRecommendationSummariesFromToolResult,
  productsFromToolResult,
} from '../tool-results';

const product = {
  id: '0198a122-0c00-7000-8000-000000000001',
  title: '스테인리스 텀블러',
  imageUrl: 'https://example.com/tumbler.jpg',
  isAffiliate: true,
  isSaved: false,
  provider: { providerId: 'approved', displayName: '승인 쇼핑몰' },
  offer: {
    id: '0198a122-0c00-7000-8000-000000000001',
    price: { amountMinor: '19900', currency: 'KRW' },
    shipping: { amountMinor: '2000', currency: 'KRW' },
    total: { amountMinor: '21900', currency: 'KRW' },
    isInStock: true,
    deliveryExpectedAt: null,
    observedAt: '2026-08-13T00:00:00.000Z',
    outboundUrl: 'https://example.com/products/tumbler',
  },
};

describe('product tool result', () => {
  it('converts a structured result without parsing assistant prose', () => {
    const result = productsFromToolResult(
      JSON.stringify({
        kind: 'product_cards',
        rankingPolicy: 'neutral-v1',
        products: [product],
      }),
    );
    expect(result).toEqual([
      expect.objectContaining({
        id: product.id,
        totalMinor: '21900',
        providerName: '승인 쇼핑몰',
      }),
    ]);
  });

  it('rejects malformed or unstructured content', () => {
    expect(productsFromToolResult('추천은 텀블러입니다')).toEqual([]);
    expect(
      productsFromToolResult(JSON.stringify({ kind: 'text', products: [product] })),
    ).toEqual([]);
  });

  it('reads only valid structured AI summaries', () => {
    expect(
      productRecommendationSummariesFromToolResult(
        JSON.stringify({
          kind: 'product_recommendations',
          recommendations: [
            {
              productId: product.id,
              aiSummary: '보온 성능과 용량이 출근용으로 알맞습니다.',
            },
          ],
        }),
      ),
    ).toEqual([
      { productId: product.id, aiSummary: '보온 성능과 용량이 출근용으로 알맞습니다.' },
    ]);
    expect(
      productRecommendationSummariesFromToolResult(
        JSON.stringify({
          kind: 'product_recommendations',
          recommendations: [{ productId: product.id, aiSummary: '' }],
        }),
      ),
    ).toEqual([]);
  });
});

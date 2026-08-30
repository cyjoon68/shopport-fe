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
    availability: 'UNKNOWN',
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
        availability: 'UNKNOWN',
      }),
    ]);
  });

  it('rejects malformed or unstructured content', () => {
    expect(productsFromToolResult('추천은 텀블러입니다')).toEqual([]);
    expect(
      productsFromToolResult(JSON.stringify({ kind: 'text', products: [product] })),
    ).toEqual([]);
  });

  it('marks a legacy product result without availability as unknown', () => {
    const legacyOffer = Object.fromEntries(
      Object.entries(product.offer).filter(([field]) => field !== 'availability'),
    );

    expect(
      productsFromToolResult({
        kind: 'product_cards',
        products: [{ ...product, offer: legacyOffer }],
      }),
    ).toEqual([expect.objectContaining({ availability: 'UNKNOWN' })]);
  });

  it.each([
    'not a url',
    '/products/tumbler',
    'javascript:alert(1)',
    'http://example.com/products/tumbler',
    'https://user:password@example.com/products/tumbler',
    '   ',
  ])('rejects an unsafe outbound URL: %s', (outboundUrl) => {
    expect(
      productsFromToolResult({
        kind: 'product_cards',
        products: [{ ...product, offer: { ...product.offer, outboundUrl } }],
      }),
    ).toEqual([]);
  });

  it('normalizes a valid HTTPS outbound URL', () => {
    expect(
      productsFromToolResult({
        kind: 'product_cards',
        products: [
          {
            ...product,
            offer: {
              ...product.offer,
              outboundUrl: '  https://EXAMPLE.com/products/a tumbler?color=sky blue  ',
            },
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        outboundUrl: 'https://example.com/products/a%20tumbler?color=sky%20blue',
      }),
    ]);
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

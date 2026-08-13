import { formatMoney, productsFromToolResult } from './product-model';

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

  it('formats KRW from amountMinor without a hardcoded display price', () => {
    expect(formatMoney('21900', 'KRW')).toContain('21,900');
  });
});

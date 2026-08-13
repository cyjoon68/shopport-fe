import type { CachedProduct } from '@/shared/storage/database';
import { productForRoute } from './product-route';

const product = (id: string): CachedProduct => ({
  id,
  title: `상품 ${id}`,
  imageUrl: `https://example.com/${id}.jpg`,
  providerId: 'provider-1',
  providerName: '판매처',
  amountMinor: '10000',
  shippingMinor: '0',
  totalMinor: '10000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  outboundUrl: `https://example.com/${id}`,
  deliveryExpectedAt: null,
  observedAt: '2026-08-13T00:00:00.000Z',
  isSaved: false,
});

describe('product detail route isolation', () => {
  it('does not expose product A while the route is product B', () => {
    const productA = product('product-a');

    expect(productForRoute('product-b', productA, productA)).toBeNull();
  });

  it('selects only the product matching the current route', () => {
    const productB = product('product-b');

    expect(productForRoute('product-b', null, productB)).toBe(productB);
  });
});

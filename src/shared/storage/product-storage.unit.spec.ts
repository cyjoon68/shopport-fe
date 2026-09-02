const mockGetAllAsync = jest.fn();
const mockDatabase = {
  execAsync: jest.fn(() => Promise.resolve()),
  getAllAsync: mockGetAllAsync,
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import { readCachedProducts } from './product-storage';

const cachedProduct = {
  id: 'product-3',
  title: '정상 상품',
  imageUrl: 'https://example.com/product.jpg',
  providerId: 'provider-1',
  providerName: '판매처',
  amountMinor: '10000',
  shippingMinor: '0',
  totalMinor: '10000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  availability: 'IN_STOCK',
  outboundUrl: 'https://example.com/product',
  deliveryExpectedAt: null,
  observedAt: '2026-08-16T00:00:00.000Z',
  isSaved: false,
};

describe('product storage', () => {
  beforeEach(() => {
    mockGetAllAsync.mockReset();
  });

  it('ignores corrupted product cache rows', async () => {
    mockGetAllAsync.mockResolvedValue([
      { payload: '{broken' },
      { payload: JSON.stringify({ id: 'product-3', title: '불완전한 상품' }) },
      { payload: JSON.stringify(cachedProduct) },
    ]);

    await expect(readCachedProducts()).resolves.toEqual([cachedProduct]);
  });

  it('ignores products with an availability value outside the stock contract', async () => {
    mockGetAllAsync.mockResolvedValue([
      { payload: JSON.stringify({ ...cachedProduct, availability: 'STALE' }) },
    ]);

    await expect(readCachedProducts()).resolves.toEqual([]);
  });

  it('normalizes legacy cached products without availability to unknown', async () => {
    const legacyProduct = Object.fromEntries(
      Object.entries(cachedProduct).filter(([field]) => field !== 'availability'),
    );
    mockGetAllAsync.mockResolvedValue([{ payload: JSON.stringify(legacyProduct) }]);

    await expect(readCachedProducts()).resolves.toEqual([
      { ...legacyProduct, availability: 'UNKNOWN' },
    ]);
  });
});

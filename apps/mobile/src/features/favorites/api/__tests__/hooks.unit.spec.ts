import { useQuery } from '@apollo/client/react';
import { renderHook, waitFor } from '@testing-library/react-native';

import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { readCachedProducts } from '@/shared/storage/database';
import type { CachedProduct } from '@/shared/storage/types';

import { useSavedProducts } from '../hooks';

const mockProduct = {
  id: 'product-1',
  title: '텀블러',
  imageUrl: 'https://example.com/product.jpg',
  providerId: 'provider-1',
  providerName: '판매처',
  amountMinor: '10000',
  shippingMinor: '0',
  totalMinor: '10000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  outboundUrl: 'https://example.com/product',
  deliveryExpectedAt: null,
  observedAt: '2026-08-13T00:00:00.000Z',
  isSaved: true,
} satisfies CachedProduct;

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => ({ data: undefined, fetchMore: jest.fn() })),
}));

jest.mock('@/shared/storage/database', () => ({
  cacheProducts: jest.fn(),
  readCachedProducts: jest.fn(() => Promise.resolve([mockProduct])),
}));

const mockedUseQuery = jest.mocked(useQuery);
const mockedReadCachedProducts = jest.mocked(readCachedProducts);

describe('useSavedProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseQuery.mockReturnValue({ data: undefined, fetchMore: jest.fn() } as never);
    mockedReadCachedProducts.mockResolvedValue([mockProduct]);
  });

  it('uses the saved-product cache while the remote query is disabled', async () => {
    const { result } = renderHook(() => useSavedProducts(false));

    await waitFor(() => expect(result.current.products).toEqual([mockProduct]));

    expect(mockedUseQuery).toHaveBeenCalledWith(
      SavedProductsDocument,
      expect.objectContaining({ skip: true }),
    );
  });
});

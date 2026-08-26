import { useQuery } from '@apollo/client/react';
import { renderHook, waitFor } from '@testing-library/react-native';

import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { readCachedProducts } from '@/shared/storage';
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

jest.mock('@/shared/storage', () => ({
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

  it('blocks a retained pagination callback after remote reads are disabled', () => {
    mockedReadCachedProducts.mockImplementation(() => new Promise(() => undefined));
    const fetchMore = jest.fn();
    mockedUseQuery.mockReturnValue({
      data: {
        savedProducts: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useSavedProducts(enabled),
      { initialProps: { enabled: true } },
    );
    const retainedLoadMore = result.current.loadMore;

    rerender({ enabled: false });
    void retainedLoadMore();

    expect(fetchMore).not.toHaveBeenCalled();
  });

  it('suppresses a duplicate cursor while fetchMore is in flight', async () => {
    mockedReadCachedProducts.mockImplementation(() => new Promise(() => undefined));
    let resolveFetchMore!: () => void;
    const fetchMore = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveFetchMore = resolve;
        }),
    );
    mockedUseQuery.mockReturnValue({
      data: {
        savedProducts: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useSavedProducts(true));

    const first = result.current.loadMore();
    await expect(result.current.loadMore()).resolves.toBeUndefined();
    expect(fetchMore).toHaveBeenCalledTimes(1);
    resolveFetchMore();
    await first;
  });

  it('allows retrying the same cursor after fetchMore rejects', async () => {
    mockedReadCachedProducts.mockImplementation(() => new Promise(() => undefined));
    const fetchMore = jest
      .fn()
      .mockRejectedValueOnce(new Error('pagination failed'))
      .mockResolvedValueOnce(undefined);
    mockedUseQuery.mockReturnValue({
      data: {
        savedProducts: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useSavedProducts(true));

    await expect(result.current.loadMore()).rejects.toThrow('pagination failed');
    await expect(result.current.loadMore()).resolves.toBeUndefined();
    expect(fetchMore).toHaveBeenCalledTimes(2);
  });

  it('keeps cursor B active when A settles first and retained A retries', async () => {
    mockedReadCachedProducts.mockImplementation(() => new Promise(() => undefined));
    let resolveA!: () => void;
    let resolveB!: () => void;
    const requestA = new Promise<void>((resolve) => {
      resolveA = resolve;
    });
    const requestB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA)
      .mockReturnValueOnce(requestB)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            savedProducts: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useSavedProducts(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;

    const firstA = retainedA();
    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    await retainedA();
    expect(fetchMore).toHaveBeenCalledTimes(2);

    resolveA();
    await firstA;
    await retainedA();
    expect(fetchMore).toHaveBeenNthCalledWith(1, {
      variables: { after: 'cursor-a', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(2, {
      variables: { after: 'cursor-b', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(3, {
      variables: { after: 'cursor-a', first: 20 },
    });
    resolveB();
    await firstB;
  });

  it('keeps A active when B settles first, then releases A after rejection', async () => {
    mockedReadCachedProducts.mockImplementation(() => new Promise(() => undefined));
    let rejectA!: (error: Error) => void;
    let resolveB!: () => void;
    const requestA = new Promise<void>((_resolve, reject) => {
      rejectA = reject;
    });
    const requestB = new Promise<void>((resolve) => {
      resolveB = resolve;
    });
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA)
      .mockReturnValueOnce(requestB)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            savedProducts: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useSavedProducts(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;
    const firstA = retainedA();
    const rejectedA = expect(firstA).rejects.toThrow('cursor A failed');

    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    resolveB();
    await firstB;
    await retainedA();
    expect(fetchMore).toHaveBeenCalledTimes(2);

    rejectA(new Error('cursor A failed'));
    await rejectedA;
    await retainedA();
    expect(fetchMore).toHaveBeenNthCalledWith(1, {
      variables: { after: 'cursor-a', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(2, {
      variables: { after: 'cursor-b', first: 20 },
    });
    expect(fetchMore).toHaveBeenNthCalledWith(3, {
      variables: { after: 'cursor-a', first: 20 },
    });
  });
});

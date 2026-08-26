import { useMutation, useQuery } from '@apollo/client/react';
import { renderHook } from '@testing-library/react-native';

import { useFoundProductRecommendations, useUpdateSavedProduct } from '../hooks';

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

const mockedUseQuery = jest.mocked(useQuery);
const mockedUseMutation = jest.mocked(useMutation);

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('useFoundProductRecommendations', () => {
  it('blocks a retained pagination callback after remote reads are disabled', () => {
    const fetchMore = jest.fn();
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFoundProductRecommendations(enabled),
      { initialProps: { enabled: true } },
    );
    const retainedLoadMore = result.current.loadMore;

    rerender({ enabled: false });
    void retainedLoadMore();

    expect(fetchMore).not.toHaveBeenCalled();
  });

  it('suppresses the same cursor only while its request is in flight', async () => {
    const request = deferred();
    const fetchMore = jest.fn(() => request.promise);
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useFoundProductRecommendations(true));

    const first = result.current.loadMore();
    const duplicate = result.current.loadMore();

    expect(fetchMore).toHaveBeenCalledTimes(1);
    await expect(duplicate).resolves.toBeUndefined();
    request.resolve();
    await first;
    await result.current.loadMore();
    expect(fetchMore).toHaveBeenCalledTimes(2);
  });

  it('clears the active cursor when fetchMore rejects so the cursor can retry', async () => {
    const fetchMore = jest
      .fn()
      .mockRejectedValueOnce(new Error('pagination failed'))
      .mockResolvedValueOnce(undefined);
    mockedUseQuery.mockReturnValue({
      data: {
        conversations: {
          edges: [],
          pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
        },
      },
      fetchMore,
    } as never);
    const { result } = renderHook(() => useFoundProductRecommendations(true));

    await expect(result.current.loadMore()).rejects.toThrow('pagination failed');
    await expect(result.current.loadMore()).resolves.toBeUndefined();
    expect(fetchMore).toHaveBeenCalledTimes(2);
  });
});

describe('useUpdateSavedProduct', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    { isSaved: false, operation: 'saveProduct' },
    { isSaved: true, operation: 'unsaveProduct' },
  ] as const)(
    'returns a stable fallback when $operation returns a null product without errors',
    async ({ isSaved, operation }) => {
      const selectedMutation = jest.fn().mockResolvedValue({
        data: { [operation]: { product: null, userErrors: [] } },
      });
      const otherMutation = jest.fn();
      mockedUseMutation
        .mockReturnValueOnce([
          operation === 'saveProduct' ? selectedMutation : otherMutation,
          {} as never,
        ])
        .mockReturnValueOnce([
          operation === 'unsaveProduct' ? selectedMutation : otherMutation,
          {} as never,
        ]);
      const { result } = renderHook(() => useUpdateSavedProduct());

      await expect(result.current('product-1', isSaved)).resolves.toBe(
        '찜을 변경하지 못했습니다.',
      );
    },
  );

  it('returns the server user error before the fallback', async () => {
    mockedUseMutation
      .mockReturnValueOnce([
        jest.fn().mockResolvedValue({
          data: {
            saveProduct: {
              product: null,
              userErrors: [{ message: '상품을 저장할 수 없습니다.' }],
            },
          },
        }),
        {} as never,
      ])
      .mockReturnValueOnce([jest.fn(), {} as never]);
    const { result } = renderHook(() => useUpdateSavedProduct());

    await expect(result.current('product-1', false)).resolves.toBe(
      '상품을 저장할 수 없습니다.',
    );
  });

  it('does not treat a product payload with an empty user error as success', async () => {
    mockedUseMutation
      .mockReturnValueOnce([
        jest.fn().mockResolvedValue({
          data: {
            saveProduct: {
              product: { id: 'product-1' },
              userErrors: [{ message: '' }],
            },
          },
        }),
        {} as never,
      ])
      .mockReturnValueOnce([jest.fn(), {} as never]);
    const { result } = renderHook(() => useUpdateSavedProduct());

    await expect(result.current('product-1', false)).resolves.toBe(
      '찜을 변경하지 못했습니다.',
    );
  });
});

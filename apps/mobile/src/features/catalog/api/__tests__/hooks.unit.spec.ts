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
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
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

  it('keeps cursor B active when A settles first and retained A retries', async () => {
    const requestA = deferred();
    const requestB = deferred();
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            conversations: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useFoundProductRecommendations(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;

    const firstA = retainedA();
    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    await retainedA();

    expect(fetchMore).toHaveBeenCalledTimes(2);
    requestA.resolve();
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
    requestB.resolve();
    await firstB;
  });

  it('keeps A active when B settles first, then releases A after rejection', async () => {
    const requestA = deferred();
    const requestB = deferred();
    const fetchMore = jest
      .fn()
      .mockReturnValueOnce(requestA.promise)
      .mockReturnValueOnce(requestB.promise)
      .mockResolvedValueOnce(undefined);
    let cursor = 'cursor-a';
    mockedUseQuery.mockImplementation(
      () =>
        ({
          data: {
            conversations: {
              edges: [],
              pageInfo: { endCursor: cursor, hasNextPage: true },
            },
          },
          fetchMore,
        }) as never,
    );
    const { result, rerender } = renderHook(
      (_props: { revision: number }) => useFoundProductRecommendations(true),
      { initialProps: { revision: 0 } },
    );
    const retainedA = result.current.loadMore;
    const firstA = retainedA();
    const rejectedA = expect(firstA).rejects.toThrow('cursor A failed');

    cursor = 'cursor-b';
    rerender({ revision: 1 });
    const firstB = result.current.loadMore();
    requestB.resolve();
    await firstB;
    await retainedA();
    expect(fetchMore).toHaveBeenCalledTimes(2);

    requestA.reject(new Error('cursor A failed'));
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

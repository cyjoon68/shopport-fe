import { useQuery } from '@apollo/client/react';
import { renderHook } from '@testing-library/react-native';

import { useFoundProductRecommendations } from '../hooks';

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

const mockedUseQuery = jest.mocked(useQuery);

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
    retainedLoadMore();

    expect(fetchMore).not.toHaveBeenCalled();
  });
});

import { render, waitFor } from '@testing-library/react-native';
import { createElement as mockCreateElement, type ReactNode } from 'react';
import { View as mockView } from 'react-native';
import { HistoryScreen } from './history-screen';

const mockCacheConversations = jest.fn();
const mockFetchMore = jest.fn();
const mockRefetch = jest.fn();
const mockQueryData = {
  conversations: {
    edges: [
      {
        node: {
          id: 'conversation-1',
          title: '새 쇼핑 대화',
          updatedAt: '2026-08-17T00:00:00.000Z',
        },
      },
    ],
    pageInfo: { endCursor: null, hasNextPage: false },
  },
};

jest.mock('expo-router', () => ({
  Redirect: () => null,
  router: { push: jest.fn() },
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: () => [jest.fn(), {}],
  useQuery: () => ({
    data: mockQueryData,
    fetchMore: mockFetchMore,
    refetch: mockRefetch,
  }),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: () => null,
}));

jest.mock('@shopport/ui', () => ({
  EmptyState: () => null,
  Screen: ({ children }: { children: ReactNode }) =>
    mockCreateElement(mockView, null, children),
}));

jest.mock('@/graphql/generated', () => ({
  readFragment: (_fragment: unknown, node: unknown) => node,
}));

jest.mock('@/features/auth/session-provider', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage/database', () => ({
  cacheConversations: (conversations: unknown) => {
    mockCacheConversations(conversations);
    return Promise.resolve();
  },
  deleteCachedConversation: jest.fn(() => Promise.resolve()),
  deleteDraft: jest.fn(() => Promise.resolve()),
  readCachedConversations: () => Promise.resolve([]),
  setConversationPinned: jest.fn(() => Promise.resolve()),
  sqliteChatPersistence: { removeItem: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/shared/ui/glass-button', () => ({
  GlassButton: ({ children }: { children: ReactNode }) =>
    mockCreateElement(mockView, null, children),
}));

describe('history screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCacheConversations.mockImplementation(() => {
      if (mockCacheConversations.mock.calls.length > 1)
        throw new Error('History cache effect ran more than once for unchanged data.');
      return Promise.resolve();
    });
  });

  it('caches a loaded conversation list once across its state rerender', async () => {
    render(<HistoryScreen />);

    await waitFor(() => {
      expect(mockCacheConversations).toHaveBeenCalledTimes(1);
    });
  });
});

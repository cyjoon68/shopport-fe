import { useQuery } from '@apollo/client/react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';
import { createElement as mockCreateElement, Fragment as mockFragment } from 'react';
import { Linking, Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import { FoundProductsDocument } from '@/graphql/generated/graphql';
import { readCachedChatMessages } from '@/shared/storage';

import { FoundProductsScreen } from './found-products-screen';

let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;
let mockEffectiveOnline: boolean | undefined;
let mockEndReached: (() => void) | undefined;
const mockFetchMore = jest.fn();
const mockSaveProduct = jest.fn();

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
}));

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(() => [mockSaveProduct, { loading: false }]),
  useQuery: jest.fn(() => ({
    data: {
      conversations: {
        edges: [],
        pageInfo: { endCursor: 'cursor-1', hasNextPage: true },
      },
    },
    fetchMore: mockFetchMore,
  })),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: mockStatus }),
}));

jest.mock('@/providers/network-provider', () => ({
  NetworkBoundary: ({ children, online }: { children: ReactNode; online: boolean }) => {
    mockEffectiveOnline = online;
    return children;
  },
  useOnline: () => mockEffectiveOnline ?? mockOnline,
}));

jest.mock('@/shared/storage', () => ({
  cacheProducts: jest.fn(() => Promise.resolve()),
  readCachedChatMessages: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: ({
    data,
    onEndReached,
    renderItem,
  }: {
    data?: ReadonlyArray<unknown>;
    onEndReached: () => void;
    renderItem?: (props: { item: unknown }) => ReactNode;
  }) => {
    mockEndReached = onEndReached;
    return mockCreateElement(
      mockFragment,
      null,
      mockCreateElement(mockText, { testID: 'product-list' }, 'products'),
      data?.map((item, index) =>
        mockCreateElement(mockFragment, { key: index }, renderItem?.({ item })),
      ),
    );
  },
}));

jest.mock('@/features/catalog', () => ({
  ProductList: jest.requireActual<{ ProductList: ComponentType }>(
    '@/features/catalog/components/product-list',
  ).ProductList,
}));

const mockedUseQuery = jest.mocked(useQuery);
const mockedReadCachedChatMessages = jest.mocked(readCachedChatMessages);

describe('found products screen session policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
    mockEffectiveOnline = undefined;
    mockEndReached = undefined;
  });

  it('does not mount private cache or query hooks while booting', () => {
    mockStatus = 'booting';
    const screen = render(<FoundProductsScreen />);

    expect(screen.queryByTestId('found-products-screen')).toBeNull();
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedReadCachedChatMessages).not.toHaveBeenCalled();
  });

  it('redirects guests before private cache or query hooks mount', () => {
    mockStatus = 'guest';
    const screen = render(<FoundProductsScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedReadCachedChatMessages).not.toHaveBeenCalled();
  });

  it('enables remote product reads for online authenticated sessions', () => {
    const screen = render(<FoundProductsScreen />);

    expect(screen.getByTestId('product-list')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      FoundProductsDocument,
      expect.objectContaining({ skip: false }),
    );
  });

  it('reads local cache with the remote product query skipped while offline-authenticated', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;
    const screen = render(<FoundProductsScreen />);

    expect(screen.getByTestId('product-list')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      FoundProductsDocument,
      expect.objectContaining({ skip: true }),
    );
    expect(mockedReadCachedChatMessages).toHaveBeenCalledTimes(1);
  });

  it('blocks a retained public end-reached callback after going offline', () => {
    const screen = render(<FoundProductsScreen />);
    const retainedEndReached = mockEndReached;

    mockStatus = 'offline-authenticated';
    screen.rerender(<FoundProductsScreen />);
    retainedEndReached?.();

    expect(mockFetchMore).not.toHaveBeenCalled();
  });

  it('blocks cached card bookmark and link actions after offline-authenticated restoration', async () => {
    mockedReadCachedChatMessages.mockResolvedValue([
      {
        id: 'message-1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-result',
            content: JSON.stringify({
              kind: 'product_cards',
              products: [
                {
                  id: 'product-1',
                  title: '립밤',
                  imageUrl: 'https://example.com/product.jpg',
                  isAffiliate: false,
                  isSaved: false,
                  provider: { providerId: 'oliveyoung', displayName: '올리브영' },
                  offer: {
                    id: 'offer-1',
                    price: { amountMinor: '3000', currency: 'KRW' },
                    shipping: { amountMinor: '0', currency: 'KRW' },
                    total: { amountMinor: '3000', currency: 'KRW' },
                    isInStock: true,
                    deliveryExpectedAt: null,
                    observedAt: '2026-08-26T00:00:00.000Z',
                    outboundUrl: 'https://example.com/product',
                  },
                },
              ],
            }),
          },
        ],
      },
    ] as never);
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(<FoundProductsScreen />);
    await waitFor(() => expect(screen.getByLabelText('립밤 찜')).toBeOnTheScreen());

    mockStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<FoundProductsScreen />);
    fireEvent.press(screen.getByLabelText('립밤 찜'));
    fireEvent.press(screen.getByLabelText('립밤 구매 링크'));

    expect(mockSaveProduct).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

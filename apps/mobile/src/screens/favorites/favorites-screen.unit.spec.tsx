import { useQuery } from '@apollo/client/react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { ComponentType, ReactNode } from 'react';
import { createElement as mockCreateElement, Fragment as mockFragment } from 'react';
import { Linking, Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { readCachedProducts } from '@/shared/storage';

import { FavoritesScreen } from './favorites-screen';

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
      savedProducts: {
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
  cacheProducts: jest.fn(),
  readCachedProducts: jest.fn(() => new Promise(() => undefined)),
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
      mockCreateElement(mockText, { testID: 'favorite-list' }, 'favorites'),
      data?.map((item, index) =>
        mockCreateElement(mockFragment, { key: index }, renderItem?.({ item })),
      ),
    );
  },
}));

jest.mock('@/features/favorites', () => ({
  FavoriteProductList: jest.requireActual<{ FavoriteProductList: ComponentType }>(
    '@/features/favorites/components/favorite-product-list',
  ).FavoriteProductList,
}));

const mockedUseQuery = jest.mocked(useQuery);
const mockedReadCachedProducts = jest.mocked(readCachedProducts);

describe('favorites screen session policy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStatus = 'authenticated';
    mockOnline = true;
    mockEffectiveOnline = undefined;
    mockEndReached = undefined;
  });

  it('does not mount private cache or query hooks while booting', () => {
    mockStatus = 'booting';
    const screen = render(<FavoritesScreen />);

    expect(screen.queryByTestId('favorites-screen')).toBeNull();
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedReadCachedProducts).not.toHaveBeenCalled();
  });

  it('redirects guests before private cache or query hooks mount', () => {
    mockStatus = 'guest';
    const screen = render(<FavoritesScreen />);

    expect(screen.getByTestId('redirect')).toHaveTextContent('/auth');
    expect(mockedUseQuery).not.toHaveBeenCalled();
    expect(mockedReadCachedProducts).not.toHaveBeenCalled();
  });

  it('enables remote favorite reads for online authenticated sessions', () => {
    const screen = render(<FavoritesScreen />);

    expect(screen.getByTestId('favorite-list')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      SavedProductsDocument,
      expect.objectContaining({ skip: false }),
    );
  });

  it('reads local cache with the remote favorites query skipped while offline-authenticated', () => {
    mockStatus = 'offline-authenticated';
    mockOnline = true;
    const screen = render(<FavoritesScreen />);

    expect(screen.getByTestId('favorite-list')).toBeOnTheScreen();
    expect(mockedUseQuery).toHaveBeenCalledWith(
      SavedProductsDocument,
      expect.objectContaining({ skip: true }),
    );
    expect(mockedReadCachedProducts).toHaveBeenCalledTimes(1);
  });

  it('blocks a retained public end-reached callback after going offline', () => {
    const screen = render(<FavoritesScreen />);
    const retainedEndReached = mockEndReached;

    mockStatus = 'offline-authenticated';
    screen.rerender(<FavoritesScreen />);
    retainedEndReached?.();

    expect(mockFetchMore).not.toHaveBeenCalled();
  });

  it('blocks cached card bookmark and link actions after offline-authenticated restoration', async () => {
    mockedUseQuery.mockReturnValue({
      data: undefined,
      fetchMore: mockFetchMore,
    } as never);
    mockedReadCachedProducts.mockResolvedValue([
      {
        id: 'product-1',
        title: '텀블러',
        imageUrl: 'https://example.com/product.jpg',
        providerId: 'daiso',
        providerName: '다이소',
        amountMinor: '5000',
        shippingMinor: '0',
        totalMinor: '5000',
        currency: 'KRW',
        isAffiliate: false,
        isInStock: true,
        outboundUrl: 'https://example.com/product',
        deliveryExpectedAt: null,
        observedAt: '2026-08-26T00:00:00.000Z',
        isSaved: true,
      },
    ]);
    const openUrl = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const screen = render(<FavoritesScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('텀블러 찜 해제')).toBeOnTheScreen(),
    );

    mockStatus = 'offline-authenticated';
    mockOnline = true;
    screen.rerender(<FavoritesScreen />);
    fireEvent.press(screen.getByLabelText('텀블러 찜 해제'));
    fireEvent.press(screen.getByLabelText('텀블러 구매 링크'));

    expect(mockSaveProduct).not.toHaveBeenCalled();
    expect(openUrl).not.toHaveBeenCalled();
  });
});

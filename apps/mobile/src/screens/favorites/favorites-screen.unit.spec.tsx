import { useQuery } from '@apollo/client/react';
import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { createElement as mockCreateElement } from 'react';
import { Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import { SavedProductsDocument } from '@/graphql/generated/graphql';
import { readCachedProducts } from '@/shared/storage';

import { FavoritesScreen } from './favorites-screen';

let mockStatus: SessionStatus = 'authenticated';
let mockOnline = true;

jest.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string }) =>
    mockCreateElement(mockText, { testID: 'redirect' }, href),
}));

jest.mock('@apollo/client/react', () => ({
  useQuery: jest.fn(() => ({ data: undefined, fetchMore: jest.fn() })),
}));

jest.mock('@/features/auth', () => ({
  useSession: () => ({ status: mockStatus }),
}));

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => mockOnline,
}));

jest.mock('@/shared/storage', () => ({
  cacheProducts: jest.fn(),
  readCachedProducts: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: () => mockCreateElement(mockText, { testID: 'favorite-list' }, 'favorites'),
}));

jest.mock('@/features/catalog', () => ({ ProductCard: () => null }));

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
});

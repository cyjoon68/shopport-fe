import { useQuery } from '@apollo/client/react';
import { render } from '@testing-library/react-native';
import type { ComponentType } from 'react';
import { createElement as mockCreateElement } from 'react';
import { Text as mockText } from 'react-native';

import type { SessionStatus } from '@/features/auth';
import { FoundProductsDocument } from '@/graphql/generated/graphql';
import { readCachedChatMessages } from '@/shared/storage';

import { FoundProductsScreen } from './found-products-screen';

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
  readCachedChatMessages: jest.fn(() => new Promise(() => undefined)),
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: () => mockCreateElement(mockText, { testID: 'product-list' }, 'products'),
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
});

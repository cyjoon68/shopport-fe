import { ApolloClient, ApolloLink, InMemoryCache, Observable } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { relayStylePagination } from '@apollo/client/utilities';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { SavedProductsDocument, SaveProductDocument } from '@/graphql/generated/graphql';
import { cacheProducts } from '@/shared/storage';

import { productFromFragment } from '../../domain/models';
import { useUpdateSavedProduct } from '../hooks';

let mockGeneration = 7;

jest.mock('@/shared/storage', () => ({
  cacheProducts: jest.fn(() => Promise.resolve()),
  capturePrivateWriteGeneration: jest.fn(() => mockGeneration),
}));

const cachedProduct = {
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
  availability: 'IN_STOCK' as const,
  outboundUrl: 'https://example.com/product',
  deliveryExpectedAt: null,
  observedAt: '2026-08-13T00:00:00.000Z',
  isSaved: false,
};

const graphqlProduct = (isSaved: boolean) => ({
  __typename: 'Product' as const,
  id: cachedProduct.id,
  title: cachedProduct.title,
  imageUrl: cachedProduct.imageUrl,
  isAffiliate: cachedProduct.isAffiliate,
  isSaved,
  provider: {
    __typename: 'Provider' as const,
    providerId: cachedProduct.providerId,
    displayName: cachedProduct.providerName,
  },
  offer: {
    __typename: 'Offer' as const,
    id: 'offer-1',
    isInStock: cachedProduct.isInStock,
    availability: cachedProduct.availability,
    deliveryExpectedAt: cachedProduct.deliveryExpectedAt,
    observedAt: cachedProduct.observedAt,
    outboundUrl: cachedProduct.outboundUrl,
    price: {
      __typename: 'Money' as const,
      amountMinor: cachedProduct.amountMinor,
      currency: cachedProduct.currency,
    },
    shipping: {
      __typename: 'Money' as const,
      amountMinor: cachedProduct.shippingMinor,
      currency: cachedProduct.currency,
    },
    total: {
      __typename: 'Money' as const,
      amountMinor: cachedProduct.totalMinor,
      currency: cachedProduct.currency,
    },
  },
});

const createClient = () =>
  new ApolloClient({
    cache: new InMemoryCache({
      typePolicies: {
        Query: { fields: { savedProducts: relayStylePagination() } },
      },
    }),
    link: new ApolloLink(
      (operation) =>
        new Observable((observer) => {
          const isSaving = operation.query === SaveProductDocument;
          const field = isSaving ? 'saveProduct' : 'unsaveProduct';
          observer.next({
            data: {
              __typename: 'Mutation',
              [field]: {
                __typename: 'ProductPayload',
                product: graphqlProduct(isSaving),
                userErrors: [],
              },
            },
          });
          observer.complete();
        }),
    ),
  });

const writeSavedProducts = (client: ReturnType<typeof createClient>, saved: boolean) => {
  client.cache.writeQuery({
    data: {
      __typename: 'Query',
      savedProducts: {
        __typename: 'ProductConnection',
        edges: saved
          ? [
              {
                __typename: 'ProductEdge',
                cursor: 'cursor-1',
                node: graphqlProduct(true),
              },
            ]
          : [],
        pageInfo: {
          __typename: 'PageInfo',
          endCursor: saved ? 'cursor-1' : null,
          hasNextPage: false,
        },
      },
    } as never,
    query: SavedProductsDocument,
    variables: { first: 20 },
  });
};

const readSavedProductIds = (client: ReturnType<typeof createClient>): Array<string> => {
  const data = client.cache.readQuery({
    query: SavedProductsDocument,
    variables: { first: 20 },
  });
  return data?.savedProducts.edges.map(({ node }) => productFromFragment(node).id) ?? [];
};

describe('saved product mutation cache updates', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGeneration = 7;
  });

  it.each([
    { initialSaved: false, expectedIds: ['product-1'], isSaved: false },
    { initialSaved: true, expectedIds: [], isSaved: true },
  ])(
    'updates the open SavedProducts connection when current saved state is $isSaved',
    async ({ expectedIds, initialSaved, isSaved }) => {
      const client = createClient();
      writeSavedProducts(client, initialSaved);
      const wrapper = ({ children }: Readonly<{ children: ReactNode }>) => (
        <ApolloProvider client={client}>{children}</ApolloProvider>
      );
      const { result } = renderHook(() => useUpdateSavedProduct(), { wrapper });

      await act(async () => {
        await expect(result.current('product-1', isSaved)).resolves.toBeNull();
      });

      expect(readSavedProductIds(client)).toEqual(expectedIds);
      expect(jest.mocked(cacheProducts)).toHaveBeenCalledWith(
        [{ ...cachedProduct, isSaved: !isSaved }],
        7,
      );
    },
  );
});

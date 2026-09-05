import { SaveProductDocument } from '@/graphql/generated/graphql';
import {
  capturePrivateWriteGeneration,
  closePrivateStorage,
  openPrivateStorage,
} from '@/shared/storage';

import { apolloClient } from './apollo-client';

const graphqlProduct = {
  __typename: 'Product' as const,
  id: 'product-1',
  title: '텀블러',
  imageUrl: 'https://example.com/product.jpg',
  isAffiliate: false,
  isSaved: true,
  provider: {
    __typename: 'Provider' as const,
    providerId: 'provider-1',
    displayName: '판매처',
  },
  offer: {
    __typename: 'Offer' as const,
    id: 'offer-1',
    isInStock: true,
    availability: 'IN_STOCK' as const,
    deliveryExpectedAt: null,
    observedAt: '2026-08-13T00:00:00.000Z',
    outboundUrl: 'https://example.com/product',
    price: { __typename: 'Money' as const, amountMinor: '10000', currency: 'KRW' },
    shipping: { __typename: 'Money' as const, amountMinor: '0', currency: 'KRW' },
    total: { __typename: 'Money' as const, amountMinor: '10000', currency: 'KRW' },
  },
};

const deferred = <T>() => {
  let resolve = (_value: T): void => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('apollo private session boundary', () => {
  afterEach(async () => {
    jest.restoreAllMocks();
    await apolloClient.clearStore();
    await closePrivateStorage();
  });

  it('does not normalize a mutation response after the private session changes', async () => {
    const requestStarted = deferred<void>();
    const response = deferred<Response>();
    jest.spyOn(globalThis, 'fetch').mockImplementation(() => {
      requestStarted.resolve(undefined);
      return response.promise;
    });
    await openPrivateStorage();
    const capturedGeneration = capturePrivateWriteGeneration();
    const mutation = apolloClient
      .mutate({
        context: { privateWriteGeneration: capturedGeneration },
        mutation: SaveProductDocument,
        variables: { input: { productId: 'product-1' } },
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
    await requestStarted.promise;

    await closePrivateStorage();
    await apolloClient.clearStore();
    await openPrivateStorage();
    response.resolve(
      new Response(
        JSON.stringify({
          data: {
            __typename: 'Mutation',
            saveProduct: {
              __typename: 'ProductPayload',
              product: graphqlProduct,
              userErrors: [],
            },
          },
        }),
        { headers: { 'content-type': 'application/json' }, status: 200 },
      ),
    );

    await expect(mutation).resolves.toBeInstanceOf(Error);
    const normalizedCache = apolloClient.cache.extract() as Record<string, unknown>;
    expect(normalizedCache['Product:product-1']).toBeUndefined();
  });
});

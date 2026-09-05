import {
  ApolloClient,
  ApolloLink,
  HttpLink,
  InMemoryCache,
  Observable,
} from '@apollo/client';
import { relayStylePagination } from '@apollo/client/utilities';

import { getAccessToken } from '@/features/auth/auth-token';
import { environment } from '@/shared/config/environment';
import { capturePrivateWriteGeneration } from '@/shared/storage/private-storage';

import {
  persistedOperationLink,
  persistedOperationPrinter,
} from './persisted-operation-link';

const authLink = new ApolloLink((operation, forward) => {
  const token = getAccessToken();
  operation.setContext(({ headers }: { headers?: Record<string, string> }) => ({
    headers: {
      ...headers,
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  }));
  return forward(operation);
});

export const privateWriteGenerationContextKey = 'privateWriteGeneration';

const privateSessionLink = new ApolloLink((operation, forward) => {
  const capturedGeneration = operation.getContext()[privateWriteGenerationContextKey] as
    | number
    | null
    | undefined;
  if (capturedGeneration === undefined) return forward(operation);
  return new Observable((observer) => {
    const subscription = forward(operation).subscribe({
      complete: () => observer.complete(),
      error: (error: unknown) => observer.error(error),
      next: (result) => {
        if (capturePrivateWriteGeneration() !== capturedGeneration) {
          observer.error(
            new Error('Private session changed while the request was pending'),
          );
          return;
        }
        observer.next(result);
      },
    });
    return () => subscription.unsubscribe();
  });
});

export const apolloClient = new ApolloClient({
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          conversations: relayStylePagination(),
          savedProducts: relayStylePagination(),
          searchProducts: relayStylePagination(['input']),
        },
      },
    },
  }),
  link: ApolloLink.from([
    persistedOperationLink,
    privateSessionLink,
    authLink,
    new HttpLink({
      print: persistedOperationPrinter,
      uri: `${environment.apiUrl}/graphql`,
    }),
  ]),
});

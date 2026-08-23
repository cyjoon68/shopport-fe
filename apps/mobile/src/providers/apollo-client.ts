import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { relayStylePagination } from '@apollo/client/utilities';

import { getAccessToken } from '@/features/auth/auth-token';
import { environment } from '@/shared/config/environment';

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
    authLink,
    new HttpLink({
      print: persistedOperationPrinter,
      uri: `${environment.apiUrl}/graphql`,
    }),
  ]),
});

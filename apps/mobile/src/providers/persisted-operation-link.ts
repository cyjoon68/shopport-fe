import { ApolloLink, Observable } from '@apollo/client';
import type { ASTNode, DocumentNode } from 'graphql';

import persistedDocuments from '@/graphql/generated/persisted-documents.json';

const operationIdHeader = 'x-shopport-operation-id';
const sha256HashPattern = /^[a-f0-9]{64}$/u;
const persistedManifest: Record<string, string> = persistedDocuments;

type DocumentWithMeta = DocumentNode & {
  __meta__?: {
    hash?: unknown;
  };
};
type GraphQLPrinter = (node: ASTNode) => string;

export const getPersistedOperationHash = (document: DocumentNode): string | undefined => {
  const hash = (document as DocumentWithMeta).__meta__?.hash;
  return typeof hash === 'string' && sha256HashPattern.test(hash) ? hash : undefined;
};

export const persistedOperationLink = new ApolloLink((operation, forward) => {
  const hash = getPersistedOperationHash(operation.query);
  if (!hash) {
    return new Observable<ApolloLink.Result>((observer) => {
      observer.error(
        new Error(
          `Missing persisted operation hash for ${operation.operationName ?? 'anonymous operation'}`,
        ),
      );
    });
  }

  const normalizedDocument = persistedManifest[hash];
  if (!normalizedDocument) {
    return new Observable<ApolloLink.Result>((observer) => {
      observer.error(new Error(`Missing persisted operation document for ${hash}`));
    });
  }

  operation.setContext(({ headers }: { headers?: Record<string, string> }) => ({
    headers: {
      ...headers,
      [operationIdHeader]: hash,
    },
  }));
  return forward(operation);
});

export const persistedOperationPrinter = (
  node: ASTNode,
  originalPrint: GraphQLPrinter,
): string => {
  const hash = getPersistedOperationHash(node as DocumentNode);
  return hash && persistedManifest[hash] ? persistedManifest[hash] : originalPrint(node);
};

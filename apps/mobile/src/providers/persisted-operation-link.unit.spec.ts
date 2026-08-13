import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { createHash } from 'node:crypto';
import { parse, stripIgnoredCharacters } from 'graphql';
import persistedDocuments from '@/graphql/generated/persisted-documents.json';
import {
  AssetDocument,
  ConversationDocument,
  ConversationsDocument,
  CreateAssetUploadDocument,
  CreateConversationDocument,
  DeleteAssetDocument,
  DeleteConversationDocument,
  DeleteViewerAccountDocument,
  ProductDocument,
  RenameConversationDocument,
  SaveProductDocument,
  SavedProductsDocument,
  SearchProductsDocument,
  UnsaveProductDocument,
  ViewerDocument,
} from '@/graphql/generated/graphql';
import {
  getPersistedOperationHash,
  persistedOperationLink,
  persistedOperationPrinter,
} from './persisted-operation-link';

const persistedManifest: Record<string, string> = persistedDocuments;

const operationDocuments = [
  CreateAssetUploadDocument,
  AssetDocument,
  DeleteAssetDocument,
  SearchProductsDocument,
  ProductDocument,
  SavedProductsDocument,
  SaveProductDocument,
  UnsaveProductDocument,
  ConversationsDocument,
  ConversationDocument,
  CreateConversationDocument,
  RenameConversationDocument,
  DeleteConversationDocument,
  DeleteViewerAccountDocument,
  ViewerDocument,
];

const response = (): Response =>
  new Response(JSON.stringify({ data: { viewer: null } }), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });

describe('persisted operation documents', () => {
  it('keeps every app operation hash aligned with the generated manifest', () => {
    const hashes = operationDocuments.map((document) =>
      getPersistedOperationHash(document),
    );

    expect(hashes).not.toContain(undefined);
    expect(new Set(hashes).size).toBe(operationDocuments.length);
    expect(Object.keys(persistedManifest).sort()).toEqual(
      hashes.filter((hash): hash is string => hash !== undefined).sort(),
    );

    for (const hash of hashes) {
      if (!hash) {
        throw new Error('Generated operation hash is missing');
      }
      const normalizedDocument = persistedManifest[hash];
      expect(normalizedDocument).toBeDefined();
      if (!normalizedDocument) {
        throw new Error(`Manifest entry is missing for ${hash}`);
      }
      expect(
        `sha256:${createHash('sha256').update(stripIgnoredCharacters(normalizedDocument)).digest('hex')}`,
      ).toBe(hash);
    }
  });

  it('adds the canonical hash to the actual HttpLink request', async () => {
    let requestInit: RequestInit | undefined;
    const fetchMock = jest.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      requestInit = init;
      return Promise.resolve(response());
    });
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: ApolloLink.from([
        persistedOperationLink,
        new HttpLink({
          fetch: fetchMock,
          print: persistedOperationPrinter,
          uri: 'https://api.shopport.test/graphql',
        }),
      ]),
    });

    await client.query({ fetchPolicy: 'no-cache', query: ViewerDocument });

    const headers = requestInit?.headers as Record<string, string>;
    expect(headers['x-shopport-operation-id']).toBe(
      getPersistedOperationHash(ViewerDocument),
    );
    const requestBody =
      typeof requestInit?.body === 'string'
        ? (JSON.parse(requestInit.body) as { query?: unknown })
        : undefined;
    const requestQuery = requestBody?.query;
    if (typeof requestQuery !== 'string') {
      throw new Error('HttpLink request did not include a GraphQL query');
    }
    const normalizedRequest = stripIgnoredCharacters(requestQuery);
    const operationHash = getPersistedOperationHash(ViewerDocument);
    if (!operationHash) {
      throw new Error('Generated Viewer hash is missing');
    }
    const manifestDocument = persistedManifest[operationHash];
    if (!manifestDocument) {
      throw new Error(`Manifest entry is missing for ${operationHash}`);
    }
    expect(normalizedRequest).toBe(stripIgnoredCharacters(manifestDocument));
    expect(`sha256:${createHash('sha256').update(normalizedRequest).digest('hex')}`).toBe(
      operationHash,
    );
  });

  it('fails closed before HttpLink when the document has no generated hash', async () => {
    let requestCount = 0;
    const fetchMock = jest.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      requestCount += 1;
      return Promise.resolve(response());
    });
    const client = new ApolloClient({
      cache: new InMemoryCache(),
      link: ApolloLink.from([
        persistedOperationLink,
        new HttpLink({ fetch: fetchMock, uri: 'https://api.shopport.test/graphql' }),
      ]),
    });

    await expect(
      client.query({
        fetchPolicy: 'no-cache',
        query: parse('query MissingHash { viewer { id } }'),
      }),
    ).rejects.toThrow('Missing persisted operation hash');
    expect(requestCount).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

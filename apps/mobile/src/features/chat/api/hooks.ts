import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import {
  type ChatClientPersistence,
  type ConnectConnectionAdapter,
  useChat,
  xhrHttpStream,
} from '@tanstack/ai-react';
import { useEffect, useRef, useState } from 'react';

import { getAccessToken } from '@/features/auth/auth-token';
import { readFragment } from '@/graphql/generated';
import {
  ConversationDocument,
  ConversationsDocument,
  ConversationSummaryFragmentDoc,
  CreateConversationDocument,
  UploadedImagesDocument,
} from '@/graphql/generated/graphql';
import { environment } from '@/shared/config/environment';
import { flushChatPersistence, sqliteChatPersistence } from '@/shared/storage';

import type { ChatRunOptions, UploadedImage } from '../types';

export const useCreateConversation = () => {
  const [mutate] = useMutation(CreateConversationDocument, {
    awaitRefetchQueries: true,
    refetchQueries: [ConversationsDocument],
  });
  const createConversation = async () => {
    const result = await mutate({ variables: { input: {} } });
    const payload = result.data?.createConversation;
    if (!payload?.conversation) {
      return {
        conversation: null,
        error: payload?.userErrors[0]?.message ?? '다시 시도해 주세요.',
      };
    }
    return {
      conversation: readFragment(ConversationSummaryFragmentDoc, payload.conversation),
      error: null,
    };
  };
  return createConversation;
};

export const useConversationHistory = (conversationId: string, online: boolean) =>
  useQuery(ConversationDocument, {
    variables: { id: conversationId },
    skip: !conversationId || !online,
    fetchPolicy: 'cache-and-network',
  });

export const useChatRun = ({
  assetId,
  conversationId,
  online,
  onFinish,
  providerIds,
}: ChatRunOptions) => {
  const client = useApolloClient();
  const onlineRef = useRef(online);
  onlineRef.current = online;
  const previousOnlineRef = useRef(online);
  const [connection] = useState<ConnectConnectionAdapter>(() => {
    const transport = xhrHttpStream(`${environment.apiUrl}/v1/ai/chat`, () => {
      const token = getAccessToken();
      return {
        headers: token ? { authorization: `Bearer ${token}` } : {},
        body: {
          assetId: assetId.current,
          ...(providerIds.current === undefined
            ? {}
            : { providerIds: providerIds.current }),
        },
        reconnect: { delayMs: 300, maxAttempts: 5 },
      };
    });
    return {
      async *connect(messages, data, abortSignal, runContext) {
        if (!onlineRef.current) return;
        yield* transport.connect(messages, data, abortSignal, runContext);
      },
      async *joinRun(runId, abortSignal) {
        if (!onlineRef.current) return;
        yield* transport.joinRun(runId, abortSignal);
      },
    };
  });
  const [persistence] = useState<ChatClientPersistence>(() => ({
    getItem: async (id) => {
      const state = await sqliteChatPersistence.getItem(id);
      if (onlineRef.current || !state || Array.isArray(state)) return state;
      return { messages: state.messages };
    },
    setItem: sqliteChatPersistence.setItem,
    removeItem: sqliteChatPersistence.removeItem,
  }));
  const chat = useChat({
    connection,
    onFinish: () => {
      onFinish();
      void flushChatPersistence(conversationId).catch(() => undefined);
      if (onlineRef.current)
        void client.refetchQueries({ include: [ConversationsDocument] });
    },
    persistence,
    queue: 'drop',
    threadId: conversationId,
  });
  useEffect(() => {
    if (previousOnlineRef.current && !online) chat.stop();
    previousOnlineRef.current = online;
  }, [chat.stop, online]);
  return chat;
};

export const useUploadedImages = (enabled: boolean) => {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const activeCursorsRef = useRef(new Set<string>());
  const { data, fetchMore } = useQuery(UploadedImagesDocument, {
    variables: { first: 20 },
    fetchPolicy: 'cache-and-network',
    skip: !enabled,
  });
  const imageResults: Array<UploadedImage> =
    data?.conversations.edges.flatMap(({ node }) =>
      node.messages.flatMap(({ parts }) =>
        parts.flatMap((part) =>
          part.__typename === 'ImageMessagePart' && part.asset.url
            ? [{ id: part.asset.id, url: part.asset.url }]
            : [],
        ),
      ),
    ) ?? [];
  const images = [...new Map(imageResults.map((image) => [image.id, image])).values()];
  const loadMore = async (): Promise<void> => {
    if (!enabledRef.current) return;
    const pageInfo = data?.conversations.pageInfo;
    const cursor = pageInfo?.endCursor;
    if (!pageInfo?.hasNextPage || !cursor || activeCursorsRef.current.has(cursor)) return;
    activeCursorsRef.current.add(cursor);
    try {
      await fetchMore({ variables: { after: cursor, first: 20 } });
    } finally {
      activeCursorsRef.current.delete(cursor);
    }
  };
  return { images, loadMore };
};

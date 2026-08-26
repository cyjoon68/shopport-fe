import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { useChat, xhrHttpStream } from '@tanstack/ai-react';
import { useState } from 'react';

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
  onFinish,
  providerIds,
}: ChatRunOptions) => {
  const client = useApolloClient();
  const [connection] = useState(() =>
    xhrHttpStream(`${environment.apiUrl}/v1/ai/chat`, () => {
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
    }),
  );
  return useChat({
    connection,
    onFinish: () => {
      onFinish();
      void flushChatPersistence(conversationId).catch(() => undefined);
      void client.refetchQueries({ include: [ConversationsDocument] });
    },
    persistence: sqliteChatPersistence,
    queue: 'drop',
    threadId: conversationId,
  });
};

export const useUploadedImages = (enabled: boolean) => {
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
  const loadMore = (): void => {
    const pageInfo = data?.conversations.pageInfo;
    if (pageInfo?.hasNextPage)
      void fetchMore({ variables: { after: pageInfo.endCursor, first: 20 } });
  };
  return { images, loadMore };
};

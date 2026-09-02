import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import {
  type ChatClientPersistence,
  type ConnectConnectionAdapter,
  useChat,
  xhrHttpStream,
} from '@tanstack/ai-react';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

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

import type { ChatRunContext, ChatRunOptions, RetailerId, UploadedImage } from '../types';

type PersistedChatState = Parameters<ChatClientPersistence['setItem']>[1];
type PersistedChatStateWithRunContext = PersistedChatState &
  Readonly<{ shopportRunContext?: ChatRunContext }>;

const resumeRunId = (state: PersistedChatState): string | null => {
  const runId = state.resume?.resumeState.runId;
  return typeof runId === 'string' ? runId : null;
};

const withoutResume = (state: PersistedChatState): PersistedChatState => ({
  messages: state.messages,
});

const canonicalPersistedState = (state: PersistedChatState): PersistedChatState =>
  state.resume
    ? { messages: state.messages, resume: state.resume }
    : withoutResume(state);

const persistedRunContext = (
  state: PersistedChatState,
  conversationId: string,
): ChatRunContext | null => {
  const candidate = (state as PersistedChatStateWithRunContext).shopportRunContext;
  if (!candidate || typeof candidate !== 'object') return null;
  const { assetId, providerIds, runId } = candidate;
  if (
    candidate.conversationId !== conversationId ||
    runId !== resumeRunId(state) ||
    (assetId !== null && typeof assetId !== 'string') ||
    (providerIds !== undefined &&
      (!Array.isArray(providerIds) ||
        providerIds.some(
          (providerId) => providerId !== 'oliveyoung' && providerId !== 'daiso',
        )))
  )
    return null;
  return {
    assetId,
    conversationId,
    providerIds: providerIds as ReadonlyArray<RetailerId> | undefined,
    runId,
  };
};

const withRunContext = (
  state: PersistedChatState,
  context: ChatRunContext | null,
): PersistedChatStateWithRunContext =>
  context && resumeRunId(state) === context.runId
    ? { ...canonicalPersistedState(state), shopportRunContext: context }
    : canonicalPersistedState(state);

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
  cancelledRunIdsRef,
  conversationId,
  online,
  onFinish,
  onRunStart,
  onResumeContext,
  providerIds,
  remoteWorkRef,
  runContextRef,
}: ChatRunOptions) => {
  const client = useApolloClient();
  const previousOnlineRef = useRef(online);
  const localCancelledRunIdsRef = useRef(new Set<string>());
  const cancelledRunIds = cancelledRunIdsRef ?? localCancelledRunIdsRef;
  const connectionActiveRef = useRef(true);
  const finishedRunIdRef = useRef<string | null>(null);
  const onRunStartRef = useRef(onRunStart);
  const onResumeContextRef = useRef(onResumeContext);
  const localRunContextRef = useRef<ChatRunContext | null>(null);
  const runContext = runContextRef ?? localRunContextRef;
  const streamRunIdRef = useRef<string | null>(null);
  const streamChunkRunIdsRef = useRef(new WeakMap<object, string>());
  onRunStartRef.current = onRunStart;
  onResumeContextRef.current = onResumeContext;
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
        if (!remoteWorkRef.current || !connectionActiveRef.current) return;
        const runId = runContext?.runId;
        if (runId) {
          finishedRunIdRef.current = null;
          streamRunIdRef.current = runId;
          onRunStartRef.current?.(runId);
        }
        for await (const chunk of transport.connect(
          messages,
          data,
          abortSignal,
          runContext,
        )) {
          if (runId) streamChunkRunIdsRef.current.set(chunk, runId);
          yield chunk;
        }
      },
      async *joinRun(runId, abortSignal) {
        if (
          !remoteWorkRef.current ||
          !connectionActiveRef.current ||
          cancelledRunIds.current.has(runId)
        )
          return;
        finishedRunIdRef.current = null;
        streamRunIdRef.current = runId;
        onRunStartRef.current?.(runId);
        for await (const chunk of transport.joinRun(runId, abortSignal)) {
          streamChunkRunIdsRef.current.set(chunk, runId);
          yield chunk;
        }
      },
    };
  });
  const [persistence] = useState<ChatClientPersistence>(() => ({
    getItem: async (id) => {
      const persisted = await sqliteChatPersistence.getItem(id);
      if (!persisted || Array.isArray(persisted)) return persisted;
      const runId = resumeRunId(persisted);
      if (runId && cancelledRunIds.current.has(runId)) return withoutResume(persisted);
      const context = persistedRunContext(persisted, id);
      if (context) {
        runContext.current = context;
        onResumeContextRef.current?.(context);
      }
      return canonicalPersistedState(persisted);
    },
    setItem: async (id, state) => {
      const stateRunId = resumeRunId(state);
      const nextState =
        stateRunId && cancelledRunIds.current.has(stateRunId)
          ? withoutResume(state)
          : state;
      const nextContext =
        stateRunId && runContext.current?.conversationId === id
          ? { ...runContext.current, runId: stateRunId }
          : null;
      const stateWithContext = withRunContext(nextState, nextContext);
      const offlineOrigin = !remoteWorkRef.current;
      if (!offlineOrigin) {
        await sqliteChatPersistence.setItem(id, stateWithContext);
        return;
      }
      const persisted = await sqliteChatPersistence.getItem(id);
      if (remoteWorkRef.current) return;
      const finalState =
        stateRunId && cancelledRunIds.current.has(stateRunId)
          ? withoutResume(nextState)
          : stateWithContext;
      if (
        persisted &&
        !Array.isArray(persisted) &&
        persisted.resume &&
        !cancelledRunIds.current.has(resumeRunId(persisted) ?? '') &&
        !nextState.resume
      ) {
        const persistedContext = persistedRunContext(persisted, id);
        await sqliteChatPersistence.setItem(id, {
          ...canonicalPersistedState(nextState),
          resume: persisted.resume,
          ...(persistedContext ? { shopportRunContext: persistedContext } : {}),
        });
        return;
      }
      await sqliteChatPersistence.setItem(id, finalState);
    },
    removeItem: async (id) => {
      if (remoteWorkRef.current) await sqliteChatPersistence.removeItem(id);
    },
  }));
  const clearPersistedResume = async (runId: string): Promise<void> => {
    cancelledRunIds.current.add(runId);
    const persisted = await sqliteChatPersistence.getItem(conversationId);
    if (!persisted || Array.isArray(persisted) || resumeRunId(persisted) !== runId)
      return;
    await sqliteChatPersistence.setItem(conversationId, withoutResume(persisted));
    await flushChatPersistence(conversationId);
  };
  const chat = useChat({
    connection,
    onChunk: (chunk) => {
      const chunkType: string = chunk.type;
      const runId =
        'runId' in chunk && typeof chunk.runId === 'string' ? chunk.runId : null;
      const chunkRunId = streamChunkRunIdsRef.current.get(chunk) ?? runId;
      if (chunkType === 'RUN_STARTED' && chunkRunId) streamRunIdRef.current = chunkRunId;
      if (chunkType === 'RUN_FINISHED')
        finishedRunIdRef.current = chunkRunId ?? streamRunIdRef.current;
    },
    onFinish: () => {
      onFinish(finishedRunIdRef.current ?? streamRunIdRef.current);
      void flushChatPersistence(conversationId).catch(() => undefined);
      if (remoteWorkRef.current)
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
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'inactive' || state === 'background')
        void flushChatPersistence(conversationId).catch(() => undefined);
    });
    return () => subscription.remove();
  }, [conversationId]);
  useEffect(() => {
    connectionActiveRef.current = true;
    return () => {
      connectionActiveRef.current = false;
    };
  }, []);
  return { ...chat, clearPersistedResume };
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

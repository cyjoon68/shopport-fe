import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import {
  type ChatClientPersistence,
  type SubscribeConnectionAdapter,
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

import type {
  ChatRunContext,
  ChatRunOptions,
  ChatRunResult,
  RetailerId,
  UploadedImage,
} from '../types';

type PersistedChatState = Parameters<ChatClientPersistence['setItem']>[1];
type PersistedChatStateWithRunContext = PersistedChatState &
  Readonly<{ shopportRunContext?: ChatRunContext }>;
type ChatOperation = {
  error: Error | null;
  runId: string | null;
};
type ChatStreamChunk = Parameters<
  NonNullable<Parameters<typeof useChat>[0]['onChunk']>
>[0];
type BufferedChatChunk = Readonly<{
  chunk: ChatStreamChunk;
  generation: number;
  runId: string;
}>;

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
  onRunError,
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
  const onRunErrorRef = useRef(onRunError);
  const onResumeContextRef = useRef(onResumeContext);
  const localRunContextRef = useRef<ChatRunContext | null>(null);
  const runContext = runContextRef ?? localRunContextRef;
  const streamChunkRunIdsRef = useRef(new WeakMap<object, string>());
  const transportGenerationRef = useRef(0);
  const activeTransportRef = useRef<Readonly<{
    generation: number;
    runId: string;
  }> | null>(null);
  const currentOperationRef = useRef<ChatOperation | null>(null);
  const operationsByRunIdRef = useRef(new Map<string, ChatOperation>());
  const pendingRunErrorRef = useRef<Readonly<{ runId: string | null }> | null>(null);
  onRunStartRef.current = onRunStart;
  onRunErrorRef.current = onRunError;
  onResumeContextRef.current = onResumeContext;
  const [connection] = useState<SubscribeConnectionAdapter>(() => {
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
    let activeBuffer: Array<BufferedChatChunk> = [];
    let activeWaiters: Array<(chunk: BufferedChatChunk | null) => void> = [];
    const push = (chunk: BufferedChatChunk): void => {
      const waiter = activeWaiters.shift();
      if (waiter) waiter(chunk);
      else activeBuffer.push(chunk);
    };
    const isCurrentTransport = (generation: number, runId: string): boolean => {
      const active = activeTransportRef.current;
      return active?.generation === generation && active.runId === runId;
    };
    const invalidateTransport = (generation: number, runId: string): void => {
      if (isCurrentTransport(generation, runId)) activeTransportRef.current = null;
    };
    return {
      subscribe(abortSignal) {
        const buffer = activeBuffer.splice(0);
        const waiters: Array<(chunk: BufferedChatChunk | null) => void> = [];
        activeBuffer = buffer;
        activeWaiters = waiters;
        return (async function* () {
          while (!abortSignal?.aborted) {
            const buffered = buffer.shift();
            const next =
              buffered ??
              (await new Promise<BufferedChatChunk | null>((resolve) => {
                const onAbort = () => resolve(null);
                waiters.push((chunk) => {
                  abortSignal?.removeEventListener('abort', onAbort);
                  resolve(chunk);
                });
                abortSignal?.addEventListener('abort', onAbort, { once: true });
              }));
            if (!next || abortSignal?.aborted) return;
            if (!isCurrentTransport(next.generation, next.runId)) continue;
            streamChunkRunIdsRef.current.set(next.chunk, next.runId);
            yield next.chunk;
          }
        })();
      },
      async send(messages, data, abortSignal, requestContext) {
        if (
          !remoteWorkRef.current ||
          !connectionActiveRef.current ||
          abortSignal?.aborted
        )
          return;
        const runId = requestContext?.runId;
        if (!runId) throw new Error('Chat run ID is required.');
        const transportGeneration = ++transportGenerationRef.current;
        activeTransportRef.current = { generation: transportGeneration, runId };
        abortSignal?.addEventListener(
          'abort',
          () => invalidateTransport(transportGeneration, runId),
          { once: true },
        );
        const operation = currentOperationRef.current;
        if (operation) {
          operation.runId = runId;
          operationsByRunIdRef.current.set(runId, operation);
        }
        finishedRunIdRef.current = null;
        onRunStartRef.current?.(runId);
        let hasTerminalEvent = false;
        let upstreamRunId: string | undefined;
        let upstreamThreadId: string | undefined;
        try {
          for await (const chunk of transport.connect(
            messages,
            data,
            abortSignal,
            requestContext,
          )) {
            if (abortSignal?.aborted || !isCurrentTransport(transportGeneration, runId))
              return;
            if ('runId' in chunk && typeof chunk.runId === 'string')
              upstreamRunId = chunk.runId;
            if ('threadId' in chunk && typeof chunk.threadId === 'string')
              upstreamThreadId = chunk.threadId;
            const chunkType = String(chunk.type);
            if (chunkType === 'RUN_FINISHED' || chunkType === 'RUN_ERROR')
              hasTerminalEvent = true;
            push({ chunk, generation: transportGeneration, runId });
          }
          if (
            abortSignal?.aborted ||
            !isCurrentTransport(transportGeneration, runId) ||
            hasTerminalEvent
          )
            return;
          push({
            chunk: {
              finishReason: 'stop',
              model: 'connect-wrapper',
              runId: upstreamRunId ?? runId,
              threadId: upstreamThreadId ?? requestContext?.threadId ?? conversationId,
              timestamp: Date.now(),
              type: 'RUN_FINISHED',
            } as ChatStreamChunk,
            generation: transportGeneration,
            runId,
          });
        } catch (error) {
          if (abortSignal?.aborted || !isCurrentTransport(transportGeneration, runId))
            return;
          if (!hasTerminalEvent)
            push({
              chunk: {
                message:
                  error instanceof Error ? error.message : 'Unknown error in connect()',
                runId: upstreamRunId ?? runId,
                threadId: upstreamThreadId ?? requestContext?.threadId ?? conversationId,
                timestamp: Date.now(),
                type: 'RUN_ERROR',
              } as ChatStreamChunk,
              generation: transportGeneration,
              runId,
            });
          throw error;
        }
      },
      async *joinRun(runId, abortSignal) {
        if (
          !remoteWorkRef.current ||
          !connectionActiveRef.current ||
          cancelledRunIds.current.has(runId)
        )
          return;
        const transportGeneration = ++transportGenerationRef.current;
        activeTransportRef.current = { generation: transportGeneration, runId };
        finishedRunIdRef.current = null;
        onRunStartRef.current?.(runId);
        for await (const chunk of transport.joinRun(runId, abortSignal)) {
          if (abortSignal?.aborted || !isCurrentTransport(transportGeneration, runId))
            return;
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
      if (chunkType === 'RUN_FINISHED') finishedRunIdRef.current = chunkRunId;
      if (chunkType === 'RUN_ERROR') {
        const pendingError = { runId: chunkRunId };
        pendingRunErrorRef.current = pendingError;
        void Promise.resolve().then(() => {
          if (pendingRunErrorRef.current === pendingError)
            pendingRunErrorRef.current = null;
        });
      }
    },
    onFinish: () => {
      onFinish(finishedRunIdRef.current);
      void flushChatPersistence(conversationId).catch(() => undefined);
      if (remoteWorkRef.current)
        void client.refetchQueries({ include: [ConversationsDocument] });
    },
    onError: (error) => {
      const pendingError = pendingRunErrorRef.current;
      pendingRunErrorRef.current = null;
      const currentOperation = currentOperationRef.current;
      const activeRunId = activeTransportRef.current?.runId ?? null;
      const failedRunId = pendingError
        ? pendingError.runId
        : (activeRunId ?? currentOperation?.runId ?? null);
      const failedOperation = pendingError
        ? failedRunId
          ? operationsByRunIdRef.current.get(failedRunId)
          : currentOperation
        : ((activeRunId ? operationsByRunIdRef.current.get(activeRunId) : undefined) ??
          currentOperation);
      if (failedOperation) failedOperation.error = error;
      onRunErrorRef.current?.(error, failedRunId);
    },
    persistence,
    queue: 'drop',
    threadId: conversationId,
  });
  const runOperation = async (operation: () => Promise<void>): Promise<ChatRunResult> => {
    const operationState: ChatOperation = { error: null, runId: null };
    currentOperationRef.current = operationState;
    try {
      try {
        await operation();
      } catch (error) {
        return {
          error: error instanceof Error ? error : new Error('다시 시도해 주세요.'),
          ok: false,
        };
      }
      return operationState.error
        ? { error: operationState.error, ok: false }
        : { ok: true };
    } finally {
      if (currentOperationRef.current === operationState)
        currentOperationRef.current = null;
      if (
        operationState.runId &&
        operationsByRunIdRef.current.get(operationState.runId) === operationState
      )
        operationsByRunIdRef.current.delete(operationState.runId);
    }
  };
  const sendMessage = (
    ...args: Parameters<typeof chat.sendMessage>
  ): Promise<ChatRunResult> => runOperation(() => chat.sendMessage(...args));
  const reload = (): Promise<ChatRunResult> => runOperation(chat.reload);
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
      transportGenerationRef.current += 1;
      activeTransportRef.current = null;
    };
  }, []);
  return { ...chat, clearPersistedResume, reload, sendMessage };
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

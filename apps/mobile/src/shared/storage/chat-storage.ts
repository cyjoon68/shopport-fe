import type {
  ChatClientPersistence,
  ChatPersistedState,
  MessagePart,
  ToolCallState,
  ToolResultState,
} from '@tanstack/ai-client';

import { database } from './connection';
import type { Draft, PendingChatWrite } from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const serializedDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const toolCallStates = {
  'awaiting-input': true,
  'input-streaming': true,
  'input-complete': true,
  'approval-requested': true,
  'approval-responded': true,
  complete: true,
  error: true,
} satisfies Record<ToolCallState, true>;

const toolResultStates = {
  streaming: true,
  complete: true,
  error: true,
} satisfies Record<ToolResultState, true>;

const isToolCallState = (value: unknown): value is ToolCallState =>
  typeof value === 'string' && Object.hasOwn(toolCallStates, value);

const isToolResultState = (value: unknown): value is ToolResultState =>
  typeof value === 'string' && Object.hasOwn(toolResultStates, value);

const isUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:'
    );
  } catch {
    return false;
  }
};

const isBase64 = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0 || /\s/u.test(value)) return false;
  try {
    atob(value);
    return true;
  } catch {
    return false;
  }
};

const isContentSource = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'url':
      return (
        isUrl(value.value) &&
        (value.mimeType === undefined || typeof value.mimeType === 'string')
      );
    case 'data':
      return (
        isBase64(value.value) &&
        typeof value.mimeType === 'string' &&
        value.mimeType.length > 0
      );
    default:
      return false;
  }
};

const isContentPart = (value: unknown): boolean => {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'text':
      return typeof value.content === 'string';
    case 'image':
    case 'audio':
    case 'video':
    case 'document':
      return isContentSource(value.source);
    default:
      return false;
  }
};

const isApproval = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.needsApproval === 'boolean' &&
  (value.approved === undefined || typeof value.approved === 'boolean');

const isPersistedPart = (value: unknown): value is MessagePart => {
  if (!isRecord(value)) return false;
  switch (value.type) {
    case 'text':
      return typeof value.content === 'string';
    case 'image':
      return isContentSource(value.source);
    case 'tool-call':
      return (
        typeof value.id === 'string' &&
        typeof value.name === 'string' &&
        typeof value.arguments === 'string' &&
        isToolCallState(value.state) &&
        (value.approval === undefined || isApproval(value.approval))
      );
    case 'tool-result':
      return (
        typeof value.toolCallId === 'string' &&
        (typeof value.content === 'string' ||
          (Array.isArray(value.content) && value.content.every(isContentPart))) &&
        isToolResultState(value.state) &&
        (value.error === undefined || typeof value.error === 'string')
      );
    case 'thinking':
      return typeof value.content === 'string';
    default:
      return false;
  }
};

const isPendingInterrupt = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.reason === 'string' &&
  (value.message === undefined || typeof value.message === 'string') &&
  (value.toolCallId === undefined || typeof value.toolCallId === 'string') &&
  (value.responseSchema === undefined || isRecord(value.responseSchema)) &&
  (value.expiresAt === undefined || typeof value.expiresAt === 'string') &&
  (value.metadata === undefined || isRecord(value.metadata));

const isResume = (value: unknown): boolean =>
  isRecord(value) &&
  isRecord(value.resumeState) &&
  typeof value.resumeState.threadId === 'string' &&
  value.resumeState.threadId.length > 0 &&
  typeof value.resumeState.runId === 'string' &&
  value.resumeState.runId.length > 0 &&
  (value.pendingInterrupts === undefined ||
    (Array.isArray(value.pendingInterrupts) &&
      value.pendingInterrupts.every(isPendingInterrupt)));

const isPersistedMessage = (
  value: unknown,
): value is ChatPersistedState['messages'][number] =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  (value.role === 'system' || value.role === 'user' || value.role === 'assistant') &&
  Array.isArray(value.parts) &&
  value.parts.every(isPersistedPart) &&
  (value.createdAt === undefined ||
    (value.createdAt instanceof Date && !Number.isNaN(value.createdAt.valueOf())));

const isPersistedChat = (value: unknown): value is ChatPersistedState =>
  isRecord(value) &&
  Array.isArray(value.messages) &&
  value.messages.every(isPersistedMessage) &&
  (value.resume === undefined || isResume(value.resume));

const reviveDates = (key: string, value: unknown): unknown => {
  if (
    key === 'createdAt' &&
    typeof value === 'string' &&
    serializedDatePattern.test(value)
  ) {
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return value;
    const serialized = date.toISOString();
    return serialized !== value && serialized.replace('.000Z', 'Z') !== value
      ? value
      : date;
  }
  return value;
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value, reviveDates) as unknown;
  } catch {
    return null;
  }
};

const chatPersistenceDelayMilliseconds = 250;
const pendingChatWrites = new Map<string, PendingChatWrite>();

const writeChatState = async (id: string, state: ChatPersistedState): Promise<void> => {
  const db = await database();
  await db.runAsync(
    'INSERT OR REPLACE INTO chat_cache (id, payload, updated_at) VALUES (?, ?, ?)',
    id,
    JSON.stringify(state),
    Date.now(),
  );
  await db.runAsync(`
    DELETE FROM chat_cache
    WHERE id NOT IN (
      SELECT id FROM chat_cache ORDER BY updated_at DESC LIMIT 50
    )
  `);
};

const writePendingChat = (id: string, pending: PendingChatWrite): Promise<void> => {
  if (pending.removed) return Promise.resolve();
  if (pending.write && pending.writingState === pending.state) return pending.write;
  const state = pending.state;
  const previous = pending.write?.catch(() => undefined) ?? Promise.resolve();
  const write = previous.then(() =>
    pending.removed ? undefined : writeChatState(id, state),
  );
  pending.write = write;
  pending.writingState = state;
  void write
    .finally(() => {
      if (pending.write !== write) return;
      pending.write = undefined;
      pending.writingState = undefined;
      if (
        pendingChatWrites.get(id) === pending &&
        (pending.removed || (pending.state === state && !pending.timer))
      )
        pendingChatWrites.delete(id);
    })
    .catch(() => undefined);
  return write;
};

const scheduleChatWrite = (id: string, pending: PendingChatWrite): void => {
  if (pending.timer) return;
  pending.timer = setTimeout(() => {
    pending.timer = undefined;
    void writePendingChat(id, pending).catch(() => undefined);
  }, chatPersistenceDelayMilliseconds);
};

const queueChatWrite = (id: string, state: ChatPersistedState): void => {
  const pending = pendingChatWrites.get(id);
  if (pending && !pending.removed) {
    pending.state = state;
    scheduleChatWrite(id, pending);
    return;
  }
  const next = {
    removed: false,
    state,
    timer: undefined,
    write: undefined,
    writingState: undefined,
  } satisfies PendingChatWrite;
  pendingChatWrites.set(id, next);
  scheduleChatWrite(id, next);
};

export const flushChatPersistence = async (id: string): Promise<void> => {
  const pending = pendingChatWrites.get(id);
  if (!pending || pending.removed) return;
  if (pending.timer) {
    clearTimeout(pending.timer);
    pending.timer = undefined;
  }
  const state = pending.state;
  await writePendingChat(id, pending);
  if (pendingChatWrites.get(id) === pending && pending.state !== state)
    await flushChatPersistence(id);
};

export const discardPendingChatWrites = async (): Promise<void> => {
  const pending = [...pendingChatWrites.values()];
  pending.forEach((entry) => {
    entry.removed = true;
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
  });
  await Promise.all(
    pending.flatMap(({ write }) => (write ? [write.catch(() => undefined)] : [])),
  );
  pendingChatWrites.clear();
};

export const readPinnedConversationIds = async (): Promise<Array<string>> => {
  const db = await database();
  const rows = await db.getAllAsync<{ conversationId: string }>(
    'SELECT conversation_id AS conversationId FROM conversation_pin ORDER BY pinned_at DESC',
  );
  return rows.map(({ conversationId }) => conversationId);
};

export const setConversationPinned = async (
  conversationId: string,
  pinned: boolean,
): Promise<void> => {
  const db = await database();
  if (pinned) {
    await db.runAsync(
      'INSERT OR REPLACE INTO conversation_pin (conversation_id, pinned_at) VALUES (?, ?)',
      conversationId,
      Date.now(),
    );
    return;
  }
  await db.runAsync(
    'DELETE FROM conversation_pin WHERE conversation_id = ?',
    conversationId,
  );
};

export const readCachedChatMessages = async (): Promise<
  ChatPersistedState['messages']
> => {
  const db = await database();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM chat_cache ORDER BY updated_at DESC LIMIT 50',
  );
  return rows.flatMap(({ payload }) => {
    const parsed = parseJson(payload);
    return isPersistedChat(parsed) ? parsed.messages : [];
  });
};

export const saveDraft = async (conversationId: string, draft: Draft): Promise<void> => {
  const db = await database();
  await db.runAsync(
    'INSERT OR REPLACE INTO draft (conversation_id, text, asset_id, asset_uri, updated_at) VALUES (?, ?, ?, ?, ?)',
    conversationId,
    draft.text,
    draft.assetId,
    draft.assetUri,
    Date.now(),
  );
};

export const readDraft = async (conversationId: string): Promise<Draft> => {
  const db = await database();
  const row = await db.getFirstAsync<{
    text: string;
    assetId: string | null;
    assetUri: string | null;
  }>(
    'SELECT text, asset_id AS assetId, asset_uri AS assetUri FROM draft WHERE conversation_id = ?',
    conversationId,
  );
  return row ?? { text: '', assetId: null, assetUri: null };
};

export const deleteDraft = async (conversationId: string): Promise<void> => {
  const db = await database();
  await db.runAsync('DELETE FROM draft WHERE conversation_id = ?', conversationId);
};

export const sqliteChatPersistence: ChatClientPersistence = {
  getItem: async (id) => {
    const pending = pendingChatWrites.get(id);
    if (pending && !pending.removed) return pending.state;
    const db = await database();
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM chat_cache WHERE id = ?',
      id,
    );
    if (!row) return null;
    const parsed = parseJson(row.payload);
    return isPersistedChat(parsed) ? parsed : null;
  },
  setItem: queueChatWrite,
  removeItem: async (id) => {
    const pending = pendingChatWrites.get(id);
    if (pending) {
      pending.removed = true;
      if (pending.timer) clearTimeout(pending.timer);
      pending.timer = undefined;
      await pending.write?.catch(() => undefined);
      if (pendingChatWrites.get(id) === pending) pendingChatWrites.delete(id);
    }
    const db = await database();
    await db.runAsync('DELETE FROM chat_cache WHERE id = ?', id);
  },
};

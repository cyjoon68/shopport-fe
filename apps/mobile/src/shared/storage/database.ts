import type { ChatClientPersistence, ChatPersistedState } from '@tanstack/ai-client';
import type { SQLiteDatabase } from 'expo-sqlite';
import { openDatabaseAsync } from 'expo-sqlite';

export type CachedProduct = Readonly<{
  id: string;
  title: string;
  imageUrl: string;
  providerId: string;
  providerName: string;
  amountMinor: string;
  shippingMinor: string;
  totalMinor: string;
  currency: string;
  isAffiliate: boolean;
  isInStock: boolean;
  outboundUrl: string;
  deliveryExpectedAt: string | null;
  observedAt: string;
  isSaved: boolean;
}>;

type Draft = Readonly<{
  text: string;
  assetId: string | null;
  assetUri: string | null;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cachedProductStringFields = [
  'id',
  'title',
  'imageUrl',
  'providerId',
  'providerName',
  'amountMinor',
  'shippingMinor',
  'totalMinor',
  'currency',
  'outboundUrl',
  'observedAt',
] as const;

const isCachedProduct = (value: unknown): value is CachedProduct =>
  isRecord(value) &&
  cachedProductStringFields.every((field) => typeof value[field] === 'string') &&
  typeof value.isAffiliate === 'boolean' &&
  typeof value.isInStock === 'boolean' &&
  typeof value.isSaved === 'boolean' &&
  (value.deliveryExpectedAt === null || typeof value.deliveryExpectedAt === 'string');

const isPersistedChat = (value: unknown): value is ChatPersistedState =>
  isRecord(value) &&
  Array.isArray(value.messages) &&
  value.messages.every(
    (message) =>
      isRecord(message) &&
      typeof message.id === 'string' &&
      (message.role === 'system' ||
        message.role === 'user' ||
        message.role === 'assistant') &&
      Array.isArray(message.parts) &&
      message.parts.every((part) => isRecord(part) && typeof part.type === 'string'),
  );

const serializedDatePattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;

const reviveDates = (key: string, value: unknown): unknown => {
  if (
    key === 'createdAt' &&
    typeof value === 'string' &&
    serializedDatePattern.test(value)
  ) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? value : date;
  }
  return value;
};

const parseJson = (value: string, revive = false): unknown => {
  try {
    return JSON.parse(value, revive ? reviveDates : undefined) as unknown;
  } catch {
    return null;
  }
};

const initialize = async (): Promise<SQLiteDatabase> => {
  const db = await openDatabaseAsync('shopport.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS conversation_pin (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      pinned_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS product_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS draft (
      conversation_id TEXT PRIMARY KEY NOT NULL,
      text TEXT NOT NULL,
      asset_id TEXT,
      asset_uri TEXT,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_cache (
      id TEXT PRIMARY KEY NOT NULL,
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
};

let databasePromise: Promise<SQLiteDatabase> | undefined;

const database = (): Promise<SQLiteDatabase> => {
  databasePromise ??= initialize();
  return databasePromise;
};

type PendingChatWrite = {
  removed: boolean;
  state: ChatPersistedState;
  timer: ReturnType<typeof setTimeout> | undefined;
  write: Promise<void> | undefined;
  writingState: ChatPersistedState | undefined;
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

const discardPendingChatWrites = async (): Promise<void> => {
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

export const cacheProducts = async (
  products: ReadonlyArray<CachedProduct>,
): Promise<void> => {
  const db = await database();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const product of products.slice(0, 100)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO product_cache (id, payload, updated_at) VALUES (?, ?, ?)',
        product.id,
        JSON.stringify(product),
        now,
      );
    }
    await db.runAsync(`
      DELETE FROM product_cache
      WHERE id NOT IN (
        SELECT id FROM product_cache ORDER BY updated_at DESC LIMIT 100
      )
    `);
  });
};

export const readCachedProducts = async (): Promise<Array<CachedProduct>> => {
  const db = await database();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM product_cache ORDER BY updated_at DESC LIMIT 100',
  );
  return rows.flatMap(({ payload }) => {
    const parsed = parseJson(payload);
    return isCachedProduct(parsed) ? [parsed] : [];
  });
};

export const readCachedChatMessages = async (): Promise<
  ChatPersistedState['messages']
> => {
  const db = await database();
  const rows = await db.getAllAsync<{ payload: string }>(
    'SELECT payload FROM chat_cache ORDER BY updated_at DESC LIMIT 50',
  );
  return rows.flatMap(({ payload }) => {
    const parsed = parseJson(payload, true);
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

export const clearPrivateStorage = async (): Promise<void> => {
  await discardPendingChatWrites();
  const db = await database();
  await db.execAsync(`
    DELETE FROM conversation_pin;
    DELETE FROM product_cache;
    DELETE FROM draft;
    DELETE FROM chat_cache;
  `);
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
    const parsed = parseJson(row.payload, true);
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

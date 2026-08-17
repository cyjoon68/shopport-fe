import type { ChatClientPersistence, ChatPersistedState } from '@tanstack/ai-client';
import { openDatabaseAsync } from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

export type CachedConversation = Readonly<{
  id: string;
  title: string;
  updatedAt: string;
}>;

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
      Array.isArray(message.parts),
  );

const reviveDates = (_key: string, value: unknown): unknown => {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u.test(value)) {
    return new Date(value);
  }
  return value;
};

const initialize = async (): Promise<SQLiteDatabase> => {
  const db = await openDatabaseAsync('shopport.db');
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS conversation_cache (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
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

export const cacheConversations = async (
  conversations: ReadonlyArray<CachedConversation>,
): Promise<void> => {
  const db = await database();
  await db.withTransactionAsync(async () => {
    for (const conversation of conversations.slice(0, 50)) {
      await db.runAsync(
        'INSERT OR REPLACE INTO conversation_cache (id, title, updated_at) VALUES (?, ?, ?)',
        conversation.id,
        conversation.title,
        conversation.updatedAt,
      );
    }
    await db.runAsync(`
      DELETE FROM conversation_cache
      WHERE id NOT IN (
        SELECT id FROM conversation_cache ORDER BY updated_at DESC LIMIT 50
      )
    `);
  });
};

export const readCachedConversations = async (): Promise<Array<CachedConversation>> => {
  const db = await database();
  return db.getAllAsync<CachedConversation>(
    'SELECT id, title, updated_at AS updatedAt FROM conversation_cache ORDER BY updated_at DESC LIMIT 50',
  );
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
    const parsed: unknown = JSON.parse(payload);
    return isRecord(parsed) && typeof parsed.id === 'string'
      ? [parsed as CachedProduct]
      : [];
  });
};

export const readCachedProduct = async (id: string): Promise<CachedProduct | null> => {
  const db = await database();
  const row = await db.getFirstAsync<{ payload: string }>(
    'SELECT payload FROM product_cache WHERE id = ? LIMIT 1',
    id,
  );
  if (!row) return null;
  const parsed: unknown = JSON.parse(row.payload);
  return isRecord(parsed) && parsed.id === id ? (parsed as CachedProduct) : null;
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
  const db = await database();
  await db.execAsync(`
    DELETE FROM conversation_cache;
    DELETE FROM conversation_pin;
    DELETE FROM product_cache;
    DELETE FROM draft;
    DELETE FROM chat_cache;
  `);
};

export const sqliteChatPersistence: ChatClientPersistence = {
  getItem: async (id) => {
    const db = await database();
    const row = await db.getFirstAsync<{ payload: string }>(
      'SELECT payload FROM chat_cache WHERE id = ?',
      id,
    );
    if (!row) return null;
    const parsed: unknown = JSON.parse(row.payload, reviveDates);
    return isPersistedChat(parsed) ? parsed : null;
  },
  setItem: async (id, state) => {
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
  },
  removeItem: async (id) => {
    const db = await database();
    await db.runAsync('DELETE FROM chat_cache WHERE id = ?', id);
  },
};

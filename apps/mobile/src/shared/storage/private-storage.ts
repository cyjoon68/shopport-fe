import { discardPendingChatWrites } from './chat-storage';
import { database } from './connection';

export const openPrivateStorage = (): Promise<void> => Promise.resolve();

export const closePrivateStorage = (): Promise<void> => Promise.resolve();

export const capturePrivateWriteGeneration = (): number | null => 0;

export const runPrivateWrite = (
  _capturedGeneration: number | null,
  write: () => Promise<void>,
): Promise<void> => write();

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

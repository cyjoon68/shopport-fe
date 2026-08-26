import { database } from './connection';

let generation = 0;
let writable = false;
const activeWrites = new Set<Promise<void>>();
let clearBarrier: Promise<unknown> = Promise.resolve();

const drainWrites = async (writes: ReadonlyArray<Promise<void>>): Promise<void> => {
  const results = await Promise.allSettled(writes);
  const rejected = results.find((result) => result.status === 'rejected');
  if (rejected) throw rejected.reason;
};

export const openPrivateStorage = async (): Promise<void> => {
  while (true) {
    const pendingClear = clearBarrier;
    const [result] = await Promise.allSettled([pendingClear]);
    if (pendingClear !== clearBarrier) continue;
    if (result.status === 'rejected') throw result.reason;
    writable = true;
    return;
  }
};

export const closePrivateStorage = (): Promise<void> => {
  writable = false;
  generation += 1;
  return drainWrites([...activeWrites]);
};

export const capturePrivateWriteGeneration = (): number | null =>
  writable ? generation : null;

export const runPrivateWrite = async (
  capturedGeneration: number | null,
  write: () => Promise<void>,
): Promise<void> => {
  if (capturedGeneration === null || !writable || generation !== capturedGeneration)
    return;
  const pending = Promise.resolve().then(async () => {
    if (writable && generation === capturedGeneration) await write();
  });
  activeWrites.add(pending);
  try {
    await pending;
  } finally {
    activeWrites.delete(pending);
  }
};

export const clearPrivateStorage = (): Promise<void> => {
  const close = closePrivateStorage();
  const clear = async (): Promise<PromiseSettledResult<void>> => {
    const [closeResult] = await Promise.allSettled([close]);
    const db = await database();
    await db.withExclusiveTransactionAsync((transaction) =>
      transaction.execAsync(`
        DELETE FROM conversation_pin;
        DELETE FROM product_cache;
        DELETE FROM draft;
        DELETE FROM chat_cache;
      `),
    );
    return closeResult;
  };
  const cleanup = clearBarrier.then(clear, clear);
  clearBarrier = cleanup;
  return cleanup.then((closeResult) => {
    if (closeResult.status === 'rejected') throw closeResult.reason;
  });
};

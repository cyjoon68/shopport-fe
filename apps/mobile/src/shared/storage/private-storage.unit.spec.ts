const mockExecAsync = jest.fn((_source: string) => Promise.resolve());
const mockTransactionExecAsync = jest.fn((_source: string) => Promise.resolve());
const mockRunAsync = jest.fn();
const mockTransaction = { execAsync: mockTransactionExecAsync };
const mockWithTransactionAsync = jest.fn<Promise<void>, [task: () => Promise<void>]>();
const mockWithExclusiveTransactionAsync = jest.fn<
  Promise<void>,
  [task: (transaction: typeof mockTransaction) => Promise<void>]
>();
const mockDatabase = {
  execAsync: mockExecAsync,
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: mockRunAsync,
  withExclusiveTransactionAsync: mockWithExclusiveTransactionAsync,
  withTransactionAsync: mockWithTransactionAsync,
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import { saveDraft, setConversationPinned, sqliteChatPersistence } from './chat-storage';
import {
  capturePrivateWriteGeneration,
  clearPrivateStorage,
  closePrivateStorage,
  openPrivateStorage,
} from './private-storage';
import { cacheProducts } from './product-storage';

const cachedProduct = {
  id: 'product-1',
  title: '상품',
  imageUrl: 'https://example.com/product.jpg',
  providerId: 'provider-1',
  providerName: '판매처',
  amountMinor: '10000',
  shippingMinor: '0',
  totalMinor: '10000',
  currency: 'KRW',
  isAffiliate: false,
  isInStock: true,
  outboundUrl: 'https://example.com/product',
  deliveryExpectedAt: null,
  observedAt: '2026-08-26T00:00:00.000Z',
  isSaved: false,
};

const deferred = () => {
  let resolve = (): void => undefined;
  let reject = (_reason?: unknown): void => undefined;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

const expectWriteBeforeClear = async (
  invokeWrite: () => void | Promise<void>,
  startScheduledWrite?: () => void,
): Promise<void> => {
  const sqlStarted = deferred();
  const sqlCommitted = deferred();
  const events: Array<string> = [];
  mockRunAsync.mockImplementationOnce(() => {
    sqlStarted.resolve();
    return sqlCommitted.promise.then(() => {
      events.push('write');
    });
  });

  await openPrivateStorage();
  const write = Promise.resolve(invokeWrite());
  startScheduledWrite?.();
  await sqlStarted.promise;

  const close = closePrivateStorage();
  const clear = clearPrivateStorage().then(() => {
    events.push('clear');
  });
  const open = openPrivateStorage();
  await Promise.resolve();
  const generationWhileClearing = capturePrivateWriteGeneration();
  const exclusiveTransactionsBeforeCommit =
    mockWithExclusiveTransactionAsync.mock.calls.length;

  sqlCommitted.resolve();
  await Promise.all([write, close, clear, open]);

  expect(generationWhileClearing).toBeNull();
  expect(exclusiveTransactionsBeforeCommit).toBe(0);
  expect(events).toEqual(['write', 'clear']);
  expect(mockWithExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
  expect(capturePrivateWriteGeneration()).not.toBeNull();
};

describe('private storage', () => {
  beforeEach(async () => {
    await closePrivateStorage();
    mockExecAsync.mockReset().mockResolvedValue(undefined);
    mockTransactionExecAsync.mockReset().mockResolvedValue(undefined);
    mockRunAsync.mockReset().mockResolvedValue(undefined);
    mockWithTransactionAsync.mockReset().mockImplementation((task) => task());
    mockWithExclusiveTransactionAsync
      .mockReset()
      .mockImplementation((task) => task(mockTransaction));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('drains a pending draft write before clearing and reopening storage', async () => {
    await expectWriteBeforeClear(() =>
      saveDraft('conversation-1', {
        text: '임시 메시지',
        assetId: null,
        assetUri: null,
      }),
    );
  });

  it('drains a pending product write before clearing and reopening storage', async () => {
    await expectWriteBeforeClear(() => cacheProducts([cachedProduct]));
  });

  it('drains a pending pin write before clearing and reopening storage', async () => {
    await expectWriteBeforeClear(() => setConversationPinned('conversation-1', true));
  });

  it('drains a pending chat write before clearing and reopening storage', async () => {
    jest.useFakeTimers();
    await expectWriteBeforeClear(
      () =>
        sqliteChatPersistence.setItem('chat-1', {
          messages: [
            {
              id: 'message-1',
              role: 'assistant',
              parts: [{ type: 'text', content: '응답' }],
            },
          ],
        }),
      () => jest.advanceTimersByTime(250),
    );
  });

  it('clears every private table in one exclusive transaction', async () => {
    await clearPrivateStorage();

    expect(mockWithExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    const statement = mockTransactionExecAsync.mock.calls.at(-1)?.[0];
    expect(statement).toContain('DELETE FROM product_cache');
    expect(statement).toContain('DELETE FROM draft');
    expect(statement).toContain('DELETE FROM chat_cache');
    expect(statement).toContain('DELETE FROM conversation_pin');
  });

  it('finishes clearing and releases the barrier when a drained write rejects', async () => {
    const sqlStarted = deferred();
    const sqlCommitted = deferred();
    const failure = new Error('write failed');
    mockRunAsync.mockImplementationOnce(() => {
      sqlStarted.resolve();
      return sqlCommitted.promise;
    });
    await openPrivateStorage();
    const write = saveDraft('conversation-1', {
      text: '임시 메시지',
      assetId: null,
      assetUri: null,
    });
    await sqlStarted.promise;
    const close = closePrivateStorage();
    const clear = clearPrivateStorage();

    sqlCommitted.reject(failure);

    await expect(write).rejects.toBe(failure);
    await expect(close).rejects.toBe(failure);
    await expect(clear).rejects.toBe(failure);
    expect(mockWithExclusiveTransactionAsync).toHaveBeenCalledTimes(1);
    await expect(openPrivateStorage()).resolves.toBeUndefined();
    expect(capturePrivateWriteGeneration()).not.toBeNull();
  });
});

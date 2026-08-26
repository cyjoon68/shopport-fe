const mockExecAsync = jest.fn<Promise<void>, [source: string]>(() => Promise.resolve());
const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn();
const mockRunAsync = jest.fn();
const mockDatabase = {
  execAsync: mockExecAsync,
  getAllAsync: mockGetAllAsync,
  getFirstAsync: mockGetFirstAsync,
  runAsync: mockRunAsync,
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import {
  clearPrivateStorage,
  flushChatPersistence,
  readCachedChatMessages,
  readCachedProducts,
  readPinnedConversationIds,
  setConversationPinned,
  sqliteChatPersistence,
} from './database';

const cachedProduct = {
  id: 'product-3',
  title: '정상 상품',
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
  observedAt: '2026-08-16T00:00:00.000Z',
  isSaved: false,
};

describe('offline cache and private storage', () => {
  beforeEach(() => {
    mockExecAsync.mockClear();
    mockGetFirstAsync.mockReset();
    mockGetAllAsync.mockReset();
    mockRunAsync.mockReset();
  });

  it('ignores corrupted product and chat cache rows', async () => {
    mockGetAllAsync.mockResolvedValue([
      { payload: '{broken' },
      { payload: JSON.stringify({ id: 'product-3', title: '불완전한 상품' }) },
      { payload: JSON.stringify(cachedProduct) },
    ]);
    await expect(readCachedProducts()).resolves.toEqual([cachedProduct]);

    mockGetFirstAsync.mockResolvedValueOnce({ payload: '{broken' });
    await expect(sqliteChatPersistence.getItem('chat-1')).resolves.toBeNull();
  });

  it('reads messages from every persisted chat', async () => {
    const messages = [
      {
        id: 'message-1',
        role: 'assistant',
        createdAt: '2026-08-16T00:00:00.000Z',
        parts: [{ type: 'text', content: '2026-08-16T00:00:00.000Z' }],
      },
    ];
    mockGetAllAsync.mockResolvedValue([{ payload: JSON.stringify({ messages }) }]);

    await expect(readCachedChatMessages()).resolves.toEqual([
      {
        ...messages[0],
        createdAt: new Date('2026-08-16T00:00:00.000Z'),
      },
    ]);
    expect(mockGetAllAsync).toHaveBeenCalledWith(
      'SELECT payload FROM chat_cache ORDER BY updated_at DESC LIMIT 50',
    );
  });

  it('clears conversations, products, drafts and persisted chat on logout', async () => {
    await clearPrivateStorage();
    const statement = mockExecAsync.mock.calls.at(-1)?.[0] as string;
    expect(statement).toContain('DELETE FROM product_cache');
    expect(statement).toContain('DELETE FROM draft');
    expect(statement).toContain('DELETE FROM chat_cache');
    expect(statement).toContain('DELETE FROM conversation_pin');
  });

  it('coalesces streamed chat persistence into the latest snapshot', async () => {
    jest.useFakeTimers();
    void sqliteChatPersistence.setItem('chat-1', {
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          parts: [{ type: 'text', content: '첫 응답' }],
        },
      ],
    });
    void sqliteChatPersistence.setItem('chat-1', {
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          parts: [{ type: 'text', content: '완성된 응답' }],
        },
      ],
    });

    jest.advanceTimersByTime(250);
    await flushChatPersistence('chat-1');

    expect(mockRunAsync).toHaveBeenCalledTimes(2);
    expect(mockRunAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO chat_cache (id, payload, updated_at) VALUES (?, ?, ?)',
      'chat-1',
      JSON.stringify({
        messages: [
          {
            id: 'message-1',
            role: 'assistant',
            parts: [{ type: 'text', content: '완성된 응답' }],
          },
        ],
      }),
      expect.any(Number),
    );
    jest.useRealTimers();
  });

  it('persists pinned conversation IDs locally', async () => {
    mockGetAllAsync.mockResolvedValue([{ conversationId: 'conversation-1' }]);
    await setConversationPinned('conversation-1', true);
    await expect(readPinnedConversationIds()).resolves.toEqual(['conversation-1']);
    expect(mockRunAsync).toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO conversation_pin'),
      'conversation-1',
      expect.any(Number),
    );
  });
});

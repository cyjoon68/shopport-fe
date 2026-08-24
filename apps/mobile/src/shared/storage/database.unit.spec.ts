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
  readCachedChatMessages,
  readCachedProducts,
  readPinnedConversationIds,
  setConversationPinned,
  sqliteChatPersistence,
} from './database';

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
      { payload: JSON.stringify({ id: 'product-3', title: '정상 상품' }) },
    ]);
    await expect(readCachedProducts()).resolves.toEqual([
      expect.objectContaining({ id: 'product-3' }),
    ]);

    mockGetFirstAsync.mockResolvedValueOnce({ payload: '{broken' });
    await expect(sqliteChatPersistence.getItem('chat-1')).resolves.toBeNull();
  });

  it('reads messages from every persisted chat', async () => {
    const messages = [
      { id: 'message-1', role: 'assistant', parts: [{ type: 'tool-result' }] },
    ];
    mockGetAllAsync.mockResolvedValue([{ payload: JSON.stringify({ messages }) }]);

    await expect(readCachedChatMessages()).resolves.toEqual(messages);
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

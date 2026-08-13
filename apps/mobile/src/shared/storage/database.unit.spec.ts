const mockExecAsync = jest.fn<Promise<void>, [source: string]>(() => Promise.resolve());
const mockGetFirstAsync = jest.fn();
const mockDatabase = {
  execAsync: mockExecAsync,
  getAllAsync: jest.fn(),
  getFirstAsync: mockGetFirstAsync,
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import { clearPrivateStorage, readCachedProduct } from './database';

describe('offline product detail and private storage', () => {
  beforeEach(() => {
    mockExecAsync.mockClear();
    mockGetFirstAsync.mockReset();
  });

  it('loads the offline product detail deterministically by ID', async () => {
    mockGetFirstAsync.mockResolvedValue({
      payload: JSON.stringify({ id: 'product-2', title: '오프라인 상품' }),
    });
    await expect(readCachedProduct('product-2')).resolves.toEqual(
      expect.objectContaining({ id: 'product-2' }),
    );
    expect(mockGetFirstAsync).toHaveBeenCalledWith(
      'SELECT payload FROM product_cache WHERE id = ? LIMIT 1',
      'product-2',
    );
  });

  it('clears conversations, products, drafts and persisted chat on logout', async () => {
    await clearPrivateStorage();
    const statement = mockExecAsync.mock.calls.at(-1)?.[0] as string;
    expect(statement).toContain('DELETE FROM conversation_cache');
    expect(statement).toContain('DELETE FROM product_cache');
    expect(statement).toContain('DELETE FROM draft');
    expect(statement).toContain('DELETE FROM chat_cache');
  });
});

const mockExecAsync = jest.fn<Promise<void>, [source: string]>(() => Promise.resolve());
const mockDatabase = {
  execAsync: mockExecAsync,
  getAllAsync: jest.fn(),
  getFirstAsync: jest.fn(),
  runAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import { clearPrivateStorage } from './private-storage';

describe('private storage', () => {
  beforeEach(() => {
    mockExecAsync.mockClear();
  });

  it('clears conversations, products, drafts and persisted chat on logout', async () => {
    await clearPrivateStorage();
    const statement = mockExecAsync.mock.calls.at(-1)?.[0] as string;
    expect(statement).toContain('DELETE FROM product_cache');
    expect(statement).toContain('DELETE FROM draft');
    expect(statement).toContain('DELETE FROM chat_cache');
    expect(statement).toContain('DELETE FROM conversation_pin');
  });
});

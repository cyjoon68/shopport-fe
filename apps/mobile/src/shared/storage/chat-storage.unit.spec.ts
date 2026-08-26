const mockGetFirstAsync = jest.fn();
const mockGetAllAsync = jest.fn();
const mockRunAsync = jest.fn();
const mockDatabase = {
  execAsync: jest.fn(() => Promise.resolve()),
  getAllAsync: mockGetAllAsync,
  getFirstAsync: mockGetFirstAsync,
  runAsync: mockRunAsync,
  withExclusiveTransactionAsync: jest.fn(),
  withTransactionAsync: jest.fn(),
};

jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(() => Promise.resolve(mockDatabase)),
}));

import {
  flushChatPersistence,
  readCachedChatMessages,
  readPinnedConversationIds,
  setConversationPinned,
  sqliteChatPersistence,
} from './chat-storage';
import { closePrivateStorage, openPrivateStorage } from './private-storage';

const validMessage = {
  id: 'message-1',
  role: 'assistant',
  createdAt: '2026-08-16T00:00:00.000Z',
  parts: [
    { type: 'text', content: '응답' },
    {
      type: 'image',
      source: { type: 'url', value: 'https://example.com/product.jpg' },
    },
    {
      type: 'image',
      source: { type: 'data', value: 'aW1hZ2U=', mimeType: 'image/png' },
    },
    {
      type: 'tool-call',
      id: 'tool-call-1',
      name: 'searchProducts',
      arguments: '{}',
      state: 'input-complete',
    },
    {
      type: 'tool-result',
      toolCallId: 'tool-call-1',
      content: '{}',
      state: 'complete',
    },
    { type: 'thinking', content: '검색 중' },
  ],
};

const malformedPersistedChats: ReadonlyArray<readonly [string, unknown]> = [
  ['missing message ID', { messages: [{ ...validMessage, id: undefined }] }],
  ['unsupported role', { messages: [{ ...validMessage, role: 'tool' }] }],
  [
    'text without string content',
    { messages: [{ ...validMessage, parts: [{ type: 'text', content: 1 }] }] },
  ],
  [
    'image without a valid URL source',
    {
      messages: [
        {
          ...validMessage,
          parts: [{ type: 'image', source: { type: 'url', value: 'not-a-url' } }],
        },
      ],
    },
  ],
  [
    'image without a valid base64 source',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            {
              type: 'image',
              source: { type: 'data', value: '%', mimeType: 'image/png' },
            },
          ],
        },
      ],
    },
  ],
  [
    'image data without a MIME type',
    {
      messages: [
        {
          ...validMessage,
          parts: [{ type: 'image', source: { type: 'data', value: 'aW1hZ2U=' } }],
        },
      ],
    },
  ],
  [
    'tool call without an ID',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            {
              type: 'tool-call',
              name: 'searchProducts',
              arguments: '{}',
              state: 'complete',
            },
          ],
        },
      ],
    },
  ],
  [
    'tool call without a name',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            { type: 'tool-call', id: 'tool-call-1', arguments: '{}', state: 'complete' },
          ],
        },
      ],
    },
  ],
  [
    'tool call without arguments',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            {
              type: 'tool-call',
              id: 'tool-call-1',
              name: 'searchProducts',
              state: 'complete',
            },
          ],
        },
      ],
    },
  ],
  [
    'tool call without a valid state',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            {
              type: 'tool-call',
              id: 'tool-call-1',
              name: 'searchProducts',
              arguments: '{}',
              state: 'done',
            },
          ],
        },
      ],
    },
  ],
  [
    'tool result without a tool call ID',
    {
      messages: [
        {
          ...validMessage,
          parts: [{ type: 'tool-result', content: '{}', state: 'complete' }],
        },
      ],
    },
  ],
  [
    'tool result without content',
    {
      messages: [
        {
          ...validMessage,
          parts: [{ type: 'tool-result', toolCallId: 'tool-call-1', state: 'complete' }],
        },
      ],
    },
  ],
  [
    'tool result without a valid state',
    {
      messages: [
        {
          ...validMessage,
          parts: [
            {
              type: 'tool-result',
              toolCallId: 'tool-call-1',
              content: '{}',
              state: 'done',
            },
          ],
        },
      ],
    },
  ],
  [
    'thinking without string content',
    { messages: [{ ...validMessage, parts: [{ type: 'thinking', content: null }] }] },
  ],
  [
    'unknown part discriminator',
    { messages: [{ ...validMessage, parts: [{ type: 'audio', source: {} }] }] },
  ],
  ['malformed createdAt', { messages: [{ ...validMessage, createdAt: 'today' }] }],
  [
    'impossible createdAt',
    { messages: [{ ...validMessage, createdAt: '2026-02-31T00:00:00.000Z' }] },
  ],
  [
    'resume without resumeState',
    { messages: [validMessage], resume: { pendingInterrupts: [] } },
  ],
  [
    'resumeState without a valid thread ID',
    {
      messages: [validMessage],
      resume: { resumeState: { threadId: '', runId: 'run-1' } },
    },
  ],
  [
    'resumeState without a valid run ID',
    {
      messages: [validMessage],
      resume: { resumeState: { threadId: 'thread-1', runId: null } },
    },
  ],
  [
    'resume with malformed pending interrupts',
    {
      messages: [validMessage],
      resume: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [{ id: 'interrupt-1' }],
      },
    },
  ],
];

describe('chat storage', () => {
  beforeEach(async () => {
    await closePrivateStorage();
    await openPrivateStorage();
    mockGetFirstAsync.mockReset();
    mockGetAllAsync.mockReset();
    mockRunAsync.mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ignores corrupted chat cache rows', async () => {
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

  it('restores every supported persisted part and optional resume data', async () => {
    const persistedChat = {
      messages: [validMessage],
      resume: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [{ id: 'interrupt-1', reason: 'approval' }],
      },
    };
    mockGetFirstAsync.mockResolvedValue({ payload: JSON.stringify(persistedChat) });

    await expect(sqliteChatPersistence.getItem('chat-1')).resolves.toEqual({
      ...persistedChat,
      messages: [
        {
          ...validMessage,
          createdAt: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    });
  });

  it.each(malformedPersistedChats)('rejects %s', async (_name, persistedChat) => {
    mockGetFirstAsync.mockResolvedValue({ payload: JSON.stringify(persistedChat) });

    await expect(sqliteChatPersistence.getItem('chat-1')).resolves.toBeNull();
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
  });

  it('does not expose or merge a pending chat snapshot from an old generation', async () => {
    jest.useFakeTimers();
    const oldState = {
      messages: [
        {
          id: 'message-1',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, content: '이전 세션' }],
        },
      ],
    };
    const newState = {
      messages: [
        {
          id: 'message-2',
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, content: '새 세션' }],
        },
      ],
    };
    void sqliteChatPersistence.setItem('chat-generation', oldState);

    await closePrivateStorage();
    await openPrivateStorage();
    mockGetFirstAsync.mockResolvedValueOnce(null);

    await expect(sqliteChatPersistence.getItem('chat-generation')).resolves.toBeNull();

    void sqliteChatPersistence.setItem('chat-generation', newState);
    jest.advanceTimersByTime(250);
    await flushChatPersistence('chat-generation');

    expect(mockRunAsync).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO chat_cache (id, payload, updated_at) VALUES (?, ?, ?)',
      'chat-generation',
      JSON.stringify(newState),
      expect.any(Number),
    );
    expect(mockRunAsync).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT OR REPLACE INTO chat_cache'),
      'chat-generation',
      JSON.stringify(oldState),
      expect.any(Number),
    );
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

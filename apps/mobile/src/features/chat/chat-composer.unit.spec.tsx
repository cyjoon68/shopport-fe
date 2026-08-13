import { act, render } from '@testing-library/react-native';
import { readDraft, saveDraft } from '@/shared/storage/database';
import { ChatComposer } from './chat-composer';

jest.mock('@/providers/network-provider', () => ({
  useOnline: () => true,
}));

jest.mock('@/shared/storage/database', () => ({
  deleteDraft: jest.fn(() => Promise.resolve()),
  readDraft: jest.fn(),
  saveDraft: jest.fn(() => Promise.resolve()),
}));

jest.mock('./asset-upload', () => ({
  removeUploadedAsset: jest.fn(() => Promise.resolve()),
  selectAndUploadAsset: jest.fn(),
}));

jest.mock('./asset-status', () => ({
  pollAssetUntilSettled: jest.fn(),
  readAssetStatus: jest.fn(),
}));

jest.mock('expo-haptics', () => ({
  ImpactFeedbackStyle: { Light: 'light' },
  impactAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-image', () => ({
  Image: () => null,
}));

type DraftValue = Readonly<{
  text: string;
  assetId: string | null;
  assetUri: string | null;
}>;

const mockedReadDraft = readDraft as jest.MockedFunction<typeof readDraft>;
const mockedSaveDraft = saveDraft as jest.MockedFunction<typeof saveDraft>;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
};

const composer = (conversationId: string) => (
  <ChatComposer
    conversationId={conversationId}
    loading={false}
    onSend={jest.fn(() => Promise.resolve())}
    onStop={jest.fn(() => Promise.resolve())}
  />
);

const inputValue = (screen: ReturnType<typeof render>): string =>
  screen.getByLabelText('쇼핑 질문').props.value as string;

describe('chat composer conversation draft isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedReadDraft.mockReset();
    mockedSaveDraft.mockClear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('resets A state before B and never saves A into the B draft', async () => {
    const draftA = deferred<DraftValue>();
    const draftB = deferred<DraftValue>();
    mockedReadDraft.mockImplementation((id) =>
      id === 'A' ? draftA.promise : draftB.promise,
    );
    const screen = render(composer('A'));

    await act(async () => {
      draftA.resolve({ text: 'A draft', assetId: 'asset-a', assetUri: 'file://a' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inputValue(screen)).toBe('A draft');
    expect(screen.getByText('이미지 제거')).toBeTruthy();

    act(() => screen.rerender(composer('B')));
    expect(inputValue(screen)).toBe('');
    expect(screen.queryByText('이미지 제거')).toBeNull();

    act(() => jest.advanceTimersByTime(250));
    expect(mockedSaveDraft).not.toHaveBeenCalledWith(
      'B',
      expect.objectContaining({ text: 'A draft', assetId: 'asset-a' }),
    );

    await act(async () => {
      draftB.resolve({ text: 'B draft', assetId: null, assetUri: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(250));
    expect(mockedSaveDraft).toHaveBeenCalledWith('B', {
      text: 'B draft',
      assetId: null,
      assetUri: null,
    });
  });

  it('ignores an out-of-order A read after switching to B', async () => {
    const draftA = deferred<DraftValue>();
    const draftB = deferred<DraftValue>();
    mockedReadDraft.mockImplementation((id) =>
      id === 'A' ? draftA.promise : draftB.promise,
    );
    const screen = render(composer('A'));
    act(() => screen.rerender(composer('B')));

    await act(async () => {
      draftA.resolve({ text: 'stale A', assetId: 'asset-a', assetUri: 'file://a' });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inputValue(screen)).toBe('');
    expect(screen.queryByText('이미지 제거')).toBeNull();

    await act(async () => {
      draftB.resolve({ text: 'current B', assetId: null, assetUri: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(inputValue(screen)).toBe('current B');
    expect(mockedSaveDraft).not.toHaveBeenCalledWith(
      'B',
      expect.objectContaining({ text: 'stale A' }),
    );
  });
});

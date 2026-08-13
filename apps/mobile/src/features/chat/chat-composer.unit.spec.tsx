import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { readDraft, saveDraft } from '@/shared/storage/database';
import { ChatComposer } from './chat-composer';
import { removeUploadedAsset, selectAndUploadAsset } from './asset-upload';
import { pollAssetUntilSettled } from './asset-status';

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
const mockedRemoveUploadedAsset = removeUploadedAsset as jest.MockedFunction<
  typeof removeUploadedAsset
>;
const mockedSelectAndUploadAsset = selectAndUploadAsset as jest.MockedFunction<
  typeof selectAndUploadAsset
>;
const mockedPollAssetUntilSettled = pollAssetUntilSettled as jest.MockedFunction<
  typeof pollAssetUntilSettled
>;
const mockedImpactAsync = Haptics.impactAsync as jest.MockedFunction<
  typeof Haptics.impactAsync
>;

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

const accessibilityDisabled = (
  screen: ReturnType<typeof render>,
  label: string,
): boolean => {
  const props = screen.getByLabelText(label).props as {
    accessibilityState?: { disabled?: boolean };
  };
  return props.accessibilityState?.disabled === true;
};

const flushPromises = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('chat composer conversation draft isolation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedReadDraft.mockReset();
    mockedReadDraft.mockResolvedValue({ text: '', assetId: null, assetUri: null });
    mockedSaveDraft.mockClear();
    mockedRemoveUploadedAsset.mockClear();
    mockedSelectAndUploadAsset.mockReset();
    mockedPollAssetUntilSettled.mockReset();
    mockedImpactAsync.mockReset();
    mockedImpactAsync.mockResolvedValue(undefined);
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
    expect(screen.getByLabelText('쇼핑 질문').props.editable).toBe(false);
    expect(accessibilityDisabled(screen, '이미지 첨부')).toBe(true);
    expect(accessibilityDisabled(screen, '메시지 보내기')).toBe(true);

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
    expect(accessibilityDisabled(screen, '이미지 첨부')).toBe(true);

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

  it('invalidates deferred upload and verification completions after unmount', async () => {
    const upload = deferred<{ id: string; uri: string } | null>();
    mockedSelectAndUploadAsset.mockReturnValue(upload.promise);
    const verification = deferred<Awaited<ReturnType<typeof pollAssetUntilSettled>>>();
    mockedPollAssetUntilSettled.mockReturnValue(verification.promise);
    mockedReadDraft.mockImplementation((id) =>
      id === 'A'
        ? Promise.resolve({ text: '', assetId: 'asset-a', assetUri: 'file://a' })
        : Promise.resolve({ text: '', assetId: null, assetUri: null }),
    );

    const screen = render(composer('A'));
    await act(flushPromises);
    expect(mockedPollAssetUntilSettled).toHaveBeenCalledWith('asset-a');
    fireEvent.press(screen.getByLabelText('이미지 첨부'));
    screen.unmount();
    const next = render(composer('B'));
    await act(flushPromises);

    await act(async () => {
      upload.resolve({ id: 'orphan-upload', uri: 'file://orphan' });
      verification.resolve('READY');
      await flushPromises();
    });

    expect(next.queryByText('이미지 제거')).toBeNull();
    expect(inputValue(next)).toBe('');
    expect(mockedRemoveUploadedAsset).toHaveBeenCalledWith('orphan-upload');
    expect(mockedRemoveUploadedAsset).not.toHaveBeenCalledWith('asset-a');
  });

  it('keeps B attachment when A removal or replacement is still awaiting', async () => {
    const removal = deferred<void>();
    mockedRemoveUploadedAsset.mockImplementation((id) =>
      id === 'asset-a' ? removal.promise : Promise.resolve(),
    );
    mockedReadDraft.mockImplementation((id) =>
      id === 'A'
        ? Promise.resolve({ text: 'A', assetId: 'asset-a', assetUri: 'file://a' })
        : Promise.resolve({ text: 'B', assetId: 'asset-b', assetUri: 'file://b' }),
    );
    const screen = render(composer('A'));
    await act(flushPromises);
    fireEvent.press(screen.getByText('이미지 제거'));
    expect(mockedRemoveUploadedAsset).toHaveBeenCalledWith('asset-a');
    screen.unmount();
    const next = render(composer('B'));
    await act(flushPromises);
    removal.resolve();
    await act(flushPromises);
    expect(next.getByText('이미지 제거')).toBeTruthy();
    expect(inputValue(next)).toBe('B');

    const replaceRemoval = deferred<void>();
    mockedRemoveUploadedAsset.mockImplementation((id) =>
      id === 'asset-a' ? replaceRemoval.promise : Promise.resolve(),
    );
    mockedSelectAndUploadAsset.mockResolvedValue({
      id: 'uploaded-a',
      uri: 'file://uploaded-a',
    });
    const replaceScreen = render(composer('A'));
    await act(flushPromises);
    fireEvent.press(replaceScreen.getByLabelText('이미지 첨부'));
    await act(flushPromises);
    replaceScreen.unmount();
    const afterReplace = render(composer('B'));
    await act(flushPromises);
    replaceRemoval.resolve();
    await act(flushPromises);
    expect(afterReplace.getByText('이미지 제거')).toBeTruthy();
    expect(inputValue(afterReplace)).toBe('B');
    expect(mockedRemoveUploadedAsset).toHaveBeenCalledWith('uploaded-a');
  });

  it('does not show a send error from an unmounted conversation', async () => {
    let rejectSend!: (error: Error) => void;
    const sendPromise = new Promise<void>((_, reject) => {
      rejectSend = reject;
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockedReadDraft.mockResolvedValue({ text: 'A', assetId: null, assetUri: null });
    const onSend = jest.fn(() => sendPromise);
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
      />,
    );
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);
    screen.unmount();
    rejectSend(new Error('stale failure'));
    await act(flushPromises);
    expect(alertSpy).not.toHaveBeenCalledWith('메시지 전송 실패', 'stale failure');
    alertSpy.mockRestore();
  });

  it('does not send A after a deferred haptic resolves post-unmount', async () => {
    const impact = deferred<void>();
    mockedImpactAsync.mockReturnValue(impact.promise);
    mockedReadDraft.mockResolvedValue({ text: 'A', assetId: null, assetUri: null });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
      />,
    );
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    expect(mockedImpactAsync).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
    screen.unmount();
    await act(async () => {
      impact.resolve();
      await flushPromises();
    });
    expect(onSend).not.toHaveBeenCalled();
  });
});

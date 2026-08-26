import { act, fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import type { pollAssetUntilSettled } from '../../../api/fetchers';
import { ChatComposer } from '../chat-composer';
import {
  composer,
  deferred,
  flushPromises,
  inputValue,
  mockedImpactAsync,
  mockedPollAssetUntilSettled,
  mockedReadDraft,
  mockedRemoveUploadedAsset,
  mockedSelectAndUploadAsset,
  resetComposerMocks,
  restoreComposerTimers,
} from './test-support';

describe('chat composer attachment isolation', () => {
  beforeEach(resetComposerMocks);
  afterEach(restoreComposerTimers);

  it('invalidates deferred upload and verification completions after unmount', async () => {
    const upload = deferred<{ id: string; uri: string } | null>();
    mockedSelectAndUploadAsset.mockReturnValue(upload.promise);
    mockedRemoveUploadedAsset.mockRejectedValue(new Error('cleanup failed'));
    const verification = deferred<Awaited<ReturnType<typeof pollAssetUntilSettled>>>();
    mockedPollAssetUntilSettled.mockReturnValue(verification.promise);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
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

  it('shows a removal error while preserving the current attachment', async () => {
    mockedRemoveUploadedAsset.mockRejectedValue(new Error('삭제할 수 없습니다.'));
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    mockedReadDraft.mockResolvedValue({
      text: 'A',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const screen = render(composer('A'));
    await act(flushPromises);
    fireEvent.press(screen.getByText('이미지 제거'));
    await act(flushPromises);
    expect(alertSpy).toHaveBeenCalledWith('이미지 제거 실패', '삭제할 수 없습니다.');
    expect(screen.getByText('이미지 제거')).toBeTruthy();
    expect(inputValue(screen)).toBe('A');
    alertSpy.mockRestore();
  });

  it('does not alert or mutate B when A removal rejects after route unmount', async () => {
    const removal = deferred<void>();
    mockedRemoveUploadedAsset.mockImplementation((id) =>
      id === 'asset-a' ? removal.promise : Promise.resolve(),
    );
    mockedReadDraft.mockImplementation((id) =>
      id === 'A'
        ? Promise.resolve({ text: 'A', assetId: 'asset-a', assetUri: 'file://a' })
        : Promise.resolve({ text: 'B', assetId: 'asset-b', assetUri: 'file://b' }),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const screen = render(composer('A'));
    await act(flushPromises);
    fireEvent.press(screen.getByText('이미지 제거'));
    screen.unmount();
    const next = render(composer('B'));
    await act(flushPromises);
    await act(async () => {
      removal.reject(new Error('stale removal failure'));
      await flushPromises();
    });
    expect(alertSpy).not.toHaveBeenCalledWith(
      '이미지 제거 실패',
      'stale removal failure',
    );
    expect(next.getByText('이미지 제거')).toBeTruthy();
    expect(inputValue(next)).toBe('B');
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

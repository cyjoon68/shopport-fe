import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert, View } from 'react-native';

import { ChatComposer } from '../chat-composer';
import type { DraftValue } from './test-support';
import {
  accessibilityDisabled,
  composer,
  deferred,
  flushPromises,
  inputValue,
  mockedDeleteDraft,
  mockedImpactAsync,
  mockedPollAssetUntilSettled,
  mockedReadAssetStatus,
  mockedReadDraft,
  mockedSaveDraft,
  mockedSelectAndUploadAsset,
  mockedUseOnline,
  resetComposerMocks,
  restoreComposerTimers,
} from './test-support';

describe('chat composer policy isolation', () => {
  beforeEach(resetComposerMocks);
  afterEach(restoreComposerTimers);

  it('sends once when a restored image changes from processing to ready across rerenders', async () => {
    const processing = deferred<'READY'>();
    mockedPollAssetUntilSettled.mockReturnValue(processing.promise);
    mockedReadDraft.mockResolvedValue({
      text: '',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      processing.resolve('READY');
      await flushPromises();
    });
    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('abandons an initial send when the effective connection goes offline during haptics', async () => {
    const impact = deferred<void>();
    mockedImpactAsync.mockReturnValue(impact.promise);
    mockedReadDraft.mockResolvedValue({
      text: '오프라인 전환',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    mockedUseOnline.mockReturnValue(false);
    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(async () => {
      impact.resolve();
      await flushPromises();
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('abandons an initial send when loading begins during haptics', async () => {
    const impact = deferred<void>();
    mockedImpactAsync.mockReturnValue(impact.promise);
    mockedReadDraft.mockResolvedValue({
      text: '로딩 전환',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(async () => {
      impact.resolve();
      await flushPromises();
    });

    expect(onSend).not.toHaveBeenCalled();
  });

  it('preserves an edited draft when its initial asset status resolves', async () => {
    const status = deferred<'READY'>();
    mockedReadDraft.mockResolvedValue({
      text: '기존 문장',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    mockedReadAssetStatus.mockReturnValue(status.promise);
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    await act(flushPromises);
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '새 문장');
    await act(async () => {
      status.resolve('READY');
      await flushPromises();
    });

    expect(onSend).not.toHaveBeenCalled();
    expect(inputValue(screen)).toBe('새 문장');
  });

  it('abandons an initial send while an attachment replacement is uploading', async () => {
    const status = deferred<'READY'>();
    const upload = deferred<{ id: string; uri: string } | null>();
    mockedReadDraft.mockResolvedValue({
      text: '',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    mockedReadAssetStatus.mockReturnValue(status.promise);
    mockedSelectAndUploadAsset.mockReturnValue(upload.promise);
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('이미지 첨부'));
    await act(async () => {
      status.resolve('READY');
      await flushPromises();
    });

    expect(onSend).not.toHaveBeenCalled();
    await act(async () => {
      upload.resolve({ id: 'asset-b', uri: 'file://b' });
      await flushPromises();
    });
  });

  it('keeps an image-only rejected draft visible without sending it', async () => {
    mockedPollAssetUntilSettled.mockResolvedValue('REJECTED');
    mockedReadDraft.mockResolvedValue({
      text: '',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    await act(flushPromises);

    expect(onSend).not.toHaveBeenCalled();
    expect(screen.getByText('이미지 제거')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith(
      '이미지 처리 실패',
      '이미지를 처리할 수 없습니다. 다른 이미지를 선택해 주세요.',
    );
    alertSpy.mockRestore();
  });

  it('keeps a text-and-image rejected draft visible without text fallback', async () => {
    mockedPollAssetUntilSettled.mockResolvedValue('REJECTED');
    mockedReadDraft.mockResolvedValue({
      text: '이 제품 찾아줘',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    await act(flushPromises);

    expect(onSend).not.toHaveBeenCalled();
    expect(inputValue(screen)).toBe('이 제품 찾아줘');
    expect(screen.getByText('이미지 제거')).toBeTruthy();
  });

  it('keeps the draft pending and clears it after the send succeeds', async () => {
    const response = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '전송할 문장',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => response.promise);
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

    expect(onSend).toHaveBeenCalledWith('전송할 문장', null);
    expect(inputValue(screen)).toBe('전송할 문장');

    await act(async () => {
      response.resolve();
      await flushPromises();
    });
    expect(inputValue(screen)).toBe('');
  });

  it('keeps the draft when sending fails', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '다시 보낼 문장',
      assetId: null,
      assetUri: null,
    });
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={jest.fn(() => Promise.reject(new Error('연결 실패')))}
        onStop={jest.fn(() => Promise.resolve())}
      />,
    );

    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(inputValue(screen)).toBe('다시 보낼 문장');
  });

  it('clears the failed submitted draft and attachment once after retry succeeds', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '다시 찾을 문장',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const onSend = jest.fn(() => Promise.reject(new Error('연결 실패')));
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
      />,
    );

    await act(flushPromises);
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(inputValue(screen)).toBe('다시 찾을 문장');
    expect(screen.getByText('이미지 제거')).toBeTruthy();
    expect(mockedDeleteDraft).not.toHaveBeenCalled();

    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        retryCleanup={{
          assetId: 'asset-a',
          revision: 1,
          text: '다시 찾을 문장',
        }}
      />,
    );
    await act(flushPromises);

    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
    expect(inputValue(screen)).toBe('');
    expect(screen.queryByText('이미지 제거')).toBeNull();

    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        retryCleanup={{
          assetId: 'asset-a',
          revision: 1,
          text: '다시 찾을 문장',
        }}
      />,
    );
    await act(flushPromises);

    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
  });

  it('cleans a failed submitted draft after the composer remounts for reconnect', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '재연결할 문장',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    const onSend = jest.fn(() => Promise.reject(new Error('연결 실패')));
    const screen = render(
      <View>
        <ChatComposer
          conversationId="A"
          key="online"
          loading={false}
          onSend={onSend}
          onStop={jest.fn(() => Promise.resolve())}
        />
      </View>,
    );

    await act(flushPromises);
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    const pendingUnmountSave = deferred<void>();
    mockedSaveDraft.mockReturnValueOnce(pendingUnmountSave.promise);

    screen.rerender(
      <View>
        <ChatComposer
          conversationId="A"
          key="reconnected"
          loading={false}
          onSend={onSend}
          onStop={jest.fn(() => Promise.resolve())}
          retryCleanup={{
            assetId: 'asset-a',
            revision: 1,
            text: '재연결할 문장',
          }}
        />
      </View>,
    );
    await act(flushPromises);

    expect(mockedDeleteDraft).not.toHaveBeenCalled();

    await act(async () => {
      pendingUnmountSave.resolve();
      await flushPromises();
    });
    await act(flushPromises);

    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
    expect(inputValue(screen)).toBe('');
    expect(screen.queryByText('이미지 제거')).toBeNull();
  });

  it('blocks direct input when a clarification requires an option', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '직접 쓴 답',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        allowFreeText={false}
        conversationId="A"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
      />,
    );
    await act(flushPromises);
    expect(screen.getByLabelText('쇼핑 질문').props.editable).toBe(false);
    expect(accessibilityDisabled(screen, '이미지 첨부')).toBe(true);
    expect(accessibilityDisabled(screen, '메시지 보내기')).toBe(true);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('hides quick actions while an additional question is active', async () => {
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading={false}
        onProviderToggle={jest.fn()}
        onSend={jest.fn(() => Promise.resolve())}
        onStop={jest.fn(() => Promise.resolve())}
        providerIds={[]}
        quickActionsEnabled={false}
      />,
    );

    await act(flushPromises);

    expect(screen.queryByTestId('chat-quick-actions')).toBeNull();
  });

  it('keeps the stop action in the NewChat footer while streaming', async () => {
    const onStop = jest.fn(() => Promise.resolve());
    const screen = render(
      <ChatComposer
        conversationId="A"
        loading
        onSend={jest.fn(() => Promise.resolve())}
        onStop={onStop}
      />,
    );

    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('응답 중지'));

    expect(onStop).toHaveBeenCalledTimes(1);
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
      await flushPromises();
    });
    expect(inputValue(screen)).toBe('');
    expect(screen.queryByText('이미지 제거')).toBeNull();

    await act(async () => {
      draftB.resolve({ text: 'current B', assetId: null, assetUri: null });
      await flushPromises();
    });
    expect(inputValue(screen)).toBe('current B');
    expect(mockedSaveDraft).not.toHaveBeenCalledWith(
      'B',
      expect.objectContaining({ text: 'stale A' }),
    );
  });
});

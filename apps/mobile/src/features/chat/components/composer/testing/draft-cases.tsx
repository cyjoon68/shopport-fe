import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

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

describe('chat composer draft isolation', () => {
  beforeEach(resetComposerMocks);
  afterEach(restoreComposerTimers);

  it('resets A state before B and never saves A into the B draft', async () => {
    const draftA = deferred<DraftValue>();
    const draftB = deferred<DraftValue>();
    mockedReadDraft.mockImplementation((id) =>
      id === 'A' ? draftA.promise : draftB.promise,
    );
    const screen = render(composer('A'));
    expect(screen.getByPlaceholderText('Shopport에게 추천받기')).toBeOnTheScreen();
    expect(screen.getByLabelText('쇼핑 질문').props.editable).toBe(false);
    expect(accessibilityDisabled(screen, '이미지 첨부')).toBe(true);
    expect(accessibilityDisabled(screen, '메시지 보내기')).toBe(true);

    await act(async () => {
      draftA.resolve({ text: 'A draft', assetId: 'asset-a', assetUri: 'file://a' });
      await flushPromises();
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
      await flushPromises();
    });
    act(() => jest.advanceTimersByTime(250));
    expect(mockedSaveDraft).toHaveBeenCalledWith('B', {
      text: 'B draft',
      assetId: null,
      assetUri: null,
    });
  });

  it('sends a draft passed from the new-chat composer once', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '조용한 무선 마우스 추천해줘',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => Promise.resolve());
    render(
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
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('조용한 무선 마우스 추천해줘', null);
  });

  it('sends an image-only initial draft once its asset is ready', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    mockedReadAssetStatus.mockResolvedValue('READY');
    const onSend = jest.fn(() => Promise.resolve());

    render(
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
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('', 'asset-a');
  });

  it('sends a text-and-image initial draft once its asset is ready', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '이 가방 찾아줘',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    mockedReadAssetStatus.mockResolvedValue('READY');
    const onSend = jest.fn(() => Promise.resolve());

    render(
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
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('이 가방 찾아줘', 'asset-a');
  });

  it('does not repeat an initial image draft send while it is pending across a rerender', async () => {
    const send = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '',
      assetId: 'asset-a',
      assetUri: 'file://a',
    });
    mockedReadAssetStatus.mockResolvedValue('READY');
    const onSend = jest.fn(() => send.promise);
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
    await act(flushPromises);
    expect(onSend).toHaveBeenCalledTimes(1);

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

    await act(async () => {
      send.resolve();
      await flushPromises();
    });
  });

  it('retries only draft cleanup after an initial send succeeds', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '전송된 초안',
      assetId: null,
      assetUri: null,
    });
    mockedDeleteDraft
      .mockRejectedValueOnce(new Error('정리 실패'))
      .mockResolvedValue(undefined);
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
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
    expect(inputValue(screen)).toBe('전송된 초안');
    expect(alertSpy).toHaveBeenCalledWith(
      '초안 정리 실패',
      '메시지는 전송되었지만 초안을 정리하지 못했습니다.',
    );

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
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(2);
    expect(inputValue(screen)).toBe('');
    alertSpy.mockRestore();
  });

  it('sends a later identical draft after the cleaned draft has advanced', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '같은 초안',
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
    await act(flushPromises);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(inputValue(screen)).toBe('');

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '같은 초안');
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(2);
  });

  it('restores a whitespace-edited draft after its submitted cleanup settles', async () => {
    const cleanup = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '같은 초안',
      assetId: null,
      assetUri: null,
    });
    mockedDeleteDraft.mockReturnValue(cleanup.promise);
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
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), ' 같은 초안 ');
    act(() => jest.advanceTimersByTime(250));
    expect(mockedSaveDraft).toHaveBeenCalledWith('A', {
      text: ' 같은 초안 ',
      assetId: null,
      assetUri: null,
    });
    mockedSaveDraft.mockClear();

    await act(async () => {
      cleanup.resolve();
      await flushPromises();
    });

    expect(inputValue(screen)).toBe(' 같은 초안 ');
    expect(mockedSaveDraft).toHaveBeenCalledWith('A', {
      text: ' 같은 초안 ',
      assetId: null,
      assetUri: null,
    });
  });

  it('cleans up a submitted initial draft after its composer unmounts', async () => {
    const response = deferred<void>();
    mockedReadDraft.mockResolvedValue({ text: '전송 중', assetId: null, assetUri: null });
    const onSend = jest.fn(() => response.promise);
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
    expect(onSend).toHaveBeenCalledTimes(1);

    screen.unmount();
    await act(async () => {
      response.resolve();
      await flushPromises();
    });

    expect(mockedDeleteDraft).toHaveBeenCalledWith('A');
  });

  it('cleans up a submitted draft after switching conversations without clearing the newer draft', async () => {
    const response = deferred<void>();
    mockedReadDraft.mockImplementation((id) =>
      Promise.resolve(
        id === 'A'
          ? { text: 'A 전송', assetId: null, assetUri: null }
          : { text: 'B 초안', assetId: null, assetUri: null },
      ),
    );
    const onSend = jest.fn(() => response.promise);
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
    screen.rerender(
      <ChatComposer
        conversationId="B"
        loading={false}
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(flushPromises);
    await act(async () => {
      response.resolve();
      await flushPromises();
    });

    expect(mockedDeleteDraft).toHaveBeenCalledWith('A');
    expect(inputValue(screen)).toBe('B 초안');
  });

  it('releases the send flight after an initial send rejects without cleaning the draft', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '다시 보낼 초안',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest
      .fn<Promise<void>, [string, string | null]>()
      .mockRejectedValueOnce(new Error('연결 실패'))
      .mockResolvedValue(undefined);
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
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).not.toHaveBeenCalled();
    expect(inputValue(screen)).toBe('다시 보낼 초안');

    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps a public manual send from racing an initial image send', async () => {
    const status = deferred<'READY'>();
    mockedReadDraft.mockResolvedValue({
      text: '',
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
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(async () => {
      status.resolve('READY');
      await flushPromises();
    });

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
  });

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

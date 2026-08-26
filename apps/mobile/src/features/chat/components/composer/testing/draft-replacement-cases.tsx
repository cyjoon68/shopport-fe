import { act, fireEvent, render } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { ChatComposer } from '../chat-composer';
import {
  deferred,
  flushPromises,
  inputValue,
  mockedDeleteDraft,
  mockedReadAssetStatus,
  mockedReadDraft,
  mockedSaveDraft,
  resetComposerMocks,
  restoreComposerTimers,
} from './test-support';

describe('chat composer draft replacement isolation', () => {
  beforeEach(resetComposerMocks);
  afterEach(restoreComposerTimers);

  it('does not auto-send a newer draft preserved before deletion', async () => {
    const response = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '처음 초안',
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
        sendInitialDraft
      />,
    );

    await act(flushPromises);
    await act(flushPromises);
    expect(onSend).toHaveBeenCalledTimes(1);

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '보존할 B 초안');
    await act(async () => {
      response.resolve();
      await flushPromises();
    });
    expect(mockedSaveDraft).toHaveBeenCalledWith('A', {
      text: '보존할 B 초안',
      assetId: null,
      assetUri: null,
    });
    expect(mockedDeleteDraft).not.toHaveBeenCalled();

    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(flushPromises);
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
    expect(mockedDeleteDraft).not.toHaveBeenCalled();
    expect(inputValue(screen)).toBe('보존할 B 초안');

    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend).toHaveBeenLastCalledWith('보존할 B 초안', null);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);
  });

  it('keeps a newer draft pending when pre-delete preservation fails', async () => {
    const response = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '처음 초안',
      assetId: null,
      assetUri: null,
    });
    mockedSaveDraft
      .mockRejectedValueOnce(new Error('저장 실패'))
      .mockResolvedValue(undefined);
    const onSend = jest.fn(() => response.promise);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '보존 실패 B');
    await act(async () => {
      response.resolve();
      await flushPromises();
    });

    expect(mockedSaveDraft).toHaveBeenCalledWith('A', {
      text: '보존 실패 B',
      assetId: null,
      assetUri: null,
    });
    expect(alertSpy).toHaveBeenCalledWith(
      '초안 저장 실패',
      '메시지는 전송되었지만 최신 초안을 저장하지 못했습니다.',
    );
    expect(mockedDeleteDraft).not.toHaveBeenCalled();

    screen.rerender(
      <ChatComposer
        conversationId="A"
        loading
        onSend={onSend}
        onStop={jest.fn(() => Promise.resolve())}
        sendInitialDraft
      />,
    );
    await act(flushPromises);
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
    expect(mockedDeleteDraft).not.toHaveBeenCalled();
    expect(inputValue(screen)).toBe('보존 실패 B');

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '복구 C');
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedSaveDraft).toHaveBeenLastCalledWith('A', {
      text: '복구 C',
      assetId: null,
      assetUri: null,
    });
    alertSpy.mockRestore();
  });

  it('does not auto-send a restored newer draft after deletion completes', async () => {
    const cleanup = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '처음 초안',
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
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '복원할 B 초안');
    await act(async () => {
      cleanup.resolve();
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

    expect(inputValue(screen)).toBe('복원할 B 초안');
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('persists C after B restoration is overtaken before unmount', async () => {
    const cleanup = deferred<void>();
    const restoreB = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '처음 초안',
      assetId: null,
      assetUri: null,
    });
    mockedDeleteDraft.mockReturnValue(cleanup.promise);
    mockedSaveDraft.mockReturnValueOnce(restoreB.promise).mockResolvedValue(undefined);
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
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), 'B 초안');
    await act(async () => {
      cleanup.resolve();
      await flushPromises();
    });
    expect(mockedSaveDraft).toHaveBeenCalledWith('A', {
      text: 'B 초안',
      assetId: null,
      assetUri: null,
    });

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), 'C 초안');
    screen.unmount();
    await act(async () => {
      restoreB.resolve();
      await flushPromises();
    });

    expect(mockedSaveDraft).toHaveBeenLastCalledWith('A', {
      text: 'C 초안',
      assetId: null,
      assetUri: null,
    });
  });

  it('recovers a rejected draft restoration on a later committed edit without resending', async () => {
    const cleanup = deferred<void>();
    mockedReadDraft.mockResolvedValue({
      text: '처음 초안',
      assetId: null,
      assetUri: null,
    });
    mockedDeleteDraft.mockReturnValue(cleanup.promise);
    mockedSaveDraft
      .mockRejectedValueOnce(new Error('저장 실패'))
      .mockResolvedValue(undefined);
    const onSend = jest.fn(() => Promise.resolve());
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
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
    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '복원 실패 C');
    await act(async () => {
      cleanup.resolve();
      await flushPromises();
    });
    expect(inputValue(screen)).toBe('복원 실패 C');
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      '초안 저장 실패',
      '메시지는 전송되었지만 최신 초안을 저장하지 못했습니다.',
    );

    fireEvent.changeText(screen.getByLabelText('쇼핑 질문'), '복구 D');
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedSaveDraft).toHaveBeenLastCalledWith('A', {
      text: '복구 D',
      assetId: null,
      assetUri: null,
    });
    alertSpy.mockRestore();
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

});


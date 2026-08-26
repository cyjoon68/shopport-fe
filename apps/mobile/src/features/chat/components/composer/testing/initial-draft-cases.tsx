import { act, fireEvent, render } from '@testing-library/react-native';
import { startTransition, StrictMode, Suspense, useState } from 'react';
import { Alert, Button } from 'react-native';

import { ChatComposer } from '../chat-composer';
import type { DraftValue } from './test-support';
import {
  accessibilityDisabled,
  composer,
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

describe('chat composer initial draft isolation', () => {
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

  it('sends an unchanged initial draft once through StrictMode renders', async () => {
    mockedReadDraft.mockResolvedValue({
      text: '반복 렌더 초안',
      assetId: null,
      assetUri: null,
    });
    const onSend = jest.fn(() => Promise.resolve());
    render(
      <StrictMode>
        <ChatComposer
          conversationId="A"
          loading={false}
          onSend={onSend}
          onStop={jest.fn(() => Promise.resolve())}
          sendInitialDraft
        />
      </StrictMode>,
    );

    await act(flushPromises);
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
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

  it('keeps the committed cleanup identity when a different draft render is abandoned', async () => {
    const never = new Promise<never>(() => undefined);
    const suspension = Object.assign(new Error('suspended draft render'), {
      then: never.then.bind(never),
    });
    mockedReadDraft.mockResolvedValue({
      text: '커밋된 초안',
      assetId: null,
      assetUri: null,
    });
    mockedDeleteDraft.mockRejectedValueOnce(new Error('정리 실패'));
    const onSend = jest.fn(() => Promise.resolve());
    const Suspend = () => {
      throw suspension;
    };
    const SuspendedComposer = () => {
      const [conversationId, setConversationId] = useState('A');
      return (
        <>
          <Button
            accessibilityLabel="보이지 않는 초안으로 전환"
            onPress={() => startTransition(() => setConversationId('B'))}
            title="전환"
          />
          <Suspense fallback={null}>
            <ChatComposer
              conversationId={conversationId}
              loading={false}
              onSend={onSend}
              onStop={jest.fn(() => Promise.resolve())}
              sendInitialDraft
            />
            {conversationId === 'B' ? <Suspend /> : null}
          </Suspense>
        </>
      );
    };
    const screen = render(<SuspendedComposer />);

    await act(flushPromises);
    await act(flushPromises);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByLabelText('보이지 않는 초안으로 전환'));
    await act(flushPromises);
    fireEvent.press(screen.getByLabelText('메시지 보내기'));
    await act(flushPromises);

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(mockedDeleteDraft).toHaveBeenCalledTimes(2);
  });

});


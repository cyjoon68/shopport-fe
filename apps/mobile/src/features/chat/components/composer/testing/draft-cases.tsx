import { act, fireEvent, render } from '@testing-library/react-native';

import { ChatComposer } from '../chat-composer';
import type { DraftValue } from './test-support';
import {
  accessibilityDisabled,
  composer,
  deferred,
  flushPromises,
  inputValue,
  mockedReadDraft,
  mockedSaveDraft,
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

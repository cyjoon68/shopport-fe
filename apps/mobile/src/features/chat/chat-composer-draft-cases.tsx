import { act, fireEvent, render } from '@testing-library/react-native';
import { ChatComposer } from './chat-composer';
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
} from './chat-composer-test-support';
import type { DraftValue } from './chat-composer-test-support';

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

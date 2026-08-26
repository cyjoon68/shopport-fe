import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform, TextInput } from 'react-native';

import { RenameConversationDialog } from './rename-conversation-dialog';

const createDeferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const DialogHarness = ({
  initialTitle = '기존 이름',
  onDismiss,
  onSubmit,
}: {
  initialTitle?: string;
  onDismiss: () => void;
  onSubmit: (title: string) => Promise<boolean>;
}) => {
  const [visible, setVisible] = useState(true);
  return (
    <RenameConversationDialog
      initialTitle={initialTitle}
      onDismiss={() => {
        onDismiss();
        setVisible(false);
      }}
      onSubmit={onSubmit}
      visible={visible}
    />
  );
};

describe('RenameConversationDialog on Android', () => {
  const originalOS = Platform.OS;

  beforeAll(() =>
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' }),
  );
  afterAll(() =>
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }),
  );

  it('announces a modal, labels and focuses the input, and supports cancel', async () => {
    const onDismiss = jest.fn();
    const focus = jest
      .spyOn(TextInput.prototype, 'focus')
      .mockImplementation(() => undefined);
    const user = userEvent.setup();
    render(
      <RenameConversationDialog
        initialTitle="기존 이름"
        onDismiss={onDismiss}
        onSubmit={jest.fn()}
        visible
      />,
    );

    const modal = screen.getByRole('dialog', { name: '대화 이름 바꾸기' });
    const input = screen.getByLabelText('대화 이름');
    expect(modal).toBeVisible();
    expect(screen.getByText('대화 이름')).toBeOnTheScreen();
    expect(input).toHaveDisplayValue('기존 이름');
    expect(focus).toHaveBeenCalledTimes(1);
    focus.mockRestore();

    await user.press(screen.getByRole('button', { name: '취소' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('disables empty submit, trims input, exposes loading, and dismisses on success', async () => {
    const deferred = createDeferred();
    const onDismiss = jest.fn();
    const onSubmit = jest.fn(() => deferred.promise);
    const user = userEvent.setup();
    render(<DialogHarness onDismiss={onDismiss} onSubmit={onSubmit} />);
    const input = screen.getByLabelText('대화 이름');

    await user.clear(input);
    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toBeDisabled();
    expect(save).not.toBeBusy();
    await user.press(save);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(input, '  새 이름  ');
    await user.press(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith('새 이름');
    expect(screen.getByRole('button', { name: '저장' })).toBeBusy();
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled();

    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('대화 이름')).not.toBeOnTheScreen();
  });

  it('preserves user edits when the server title changes while open', async () => {
    const user = userEvent.setup();
    const view = render(
      <RenameConversationDialog
        initialTitle="기존 이름"
        onDismiss={jest.fn()}
        onSubmit={jest.fn()}
        visible
      />,
    );
    const input = screen.getByLabelText('대화 이름');

    await user.clear(input);
    await user.type(input, '사용자 편집');
    view.rerender(
      <RenameConversationDialog
        initialTitle="서버 이름"
        onDismiss={jest.fn()}
        onSubmit={jest.fn()}
        visible
      />,
    );

    expect(screen.getByLabelText('대화 이름')).toHaveDisplayValue('사용자 편집');
  });

  it('keeps a pending submit busy and dismisses after the server title changes', async () => {
    const deferred = createDeferred();
    const onDismiss = jest.fn();
    const onSubmit = jest.fn(() => deferred.promise);
    const user = userEvent.setup();
    const view = render(
      <DialogHarness
        initialTitle="기존 이름"
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />,
    );
    const input = screen.getByLabelText('대화 이름');
    await user.clear(input);
    await user.type(input, '새 이름');
    await user.press(screen.getByRole('button', { name: '저장' }));

    view.rerender(
      <DialogHarness
        initialTitle="서버 이름"
        onDismiss={onDismiss}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText('대화 이름')).toHaveDisplayValue('새 이름');
    expect(screen.getByRole('button', { name: '저장' })).toBeBusy();
    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('dialog', { name: '대화 이름 바꾸기' }),
    ).not.toBeOnTheScreen();
  });
});

import { act, render, screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';
import { Platform } from 'react-native';

import { RenameConversationDialog } from './rename-conversation-dialog';

const createDeferred = () => {
  let resolve!: (value: boolean) => void;
  const promise = new Promise<boolean>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
};

const DialogHarness = ({
  onDismiss,
  onSubmit,
}: {
  onDismiss: () => void;
  onSubmit: (title: string) => Promise<boolean>;
}) => {
  const [visible, setVisible] = useState(true);
  return (
    <RenameConversationDialog
      initialTitle="기존 이름"
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
    const user = userEvent.setup();
    render(
      <RenameConversationDialog
        initialTitle="기존 이름"
        onDismiss={onDismiss}
        onSubmit={jest.fn()}
        visible
      />,
    );

    const modal = screen.getByLabelText('대화 이름 바꾸기');
    const input = screen.getByLabelText('대화 이름');
    expect(modal.props.accessibilityViewIsModal).toBe(true);
    expect(screen.getByText('대화 이름')).toBeOnTheScreen();
    expect(input).toHaveDisplayValue('기존 이름');
    expect(input).toHaveProp('autoFocus', true);

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
    expect(save.props.accessibilityState).toEqual({ busy: false, disabled: true });
    await user.press(save);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(input, '  새 이름  ');
    await user.press(screen.getByRole('button', { name: '저장' }));

    expect(onSubmit).toHaveBeenCalledWith('새 이름');
    expect(screen.getByRole('button', { name: '저장' }).props.accessibilityState).toEqual(
      {
        busy: true,
        disabled: true,
      },
    );
    expect(screen.getByRole('button', { name: '취소' }).props.accessibilityState).toEqual(
      {
        disabled: true,
      },
    );

    await act(async () => {
      deferred.resolve(true);
      await deferred.promise;
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('대화 이름')).not.toBeOnTheScreen();
  });
});

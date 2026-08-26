import { useMutation } from '@apollo/client/react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { AlertButton } from 'react-native';
import { Alert } from 'react-native';

import {
  DeleteConversationDocument,
  RenameConversationDocument,
} from '@/graphql/generated/graphql';
import {
  deleteDraft,
  setConversationPinned,
  sqliteChatPersistence,
} from '@/shared/storage';

import { useConversationActions } from '../hooks';

jest.mock('@apollo/client/react', () => ({ useMutation: jest.fn() }));

jest.mock('@/shared/storage', () => ({
  deleteDraft: jest.fn(),
  setConversationPinned: jest.fn(),
  sqliteChatPersistence: { removeItem: jest.fn() },
}));

const mockedUseMutation = jest.mocked(useMutation);
const mockedDeleteDraft = jest.mocked(deleteDraft);
const mockedSetConversationPinned = jest.mocked(setConversationPinned);
const mockedPersistence = jest.mocked(sqliteChatPersistence);
const renameConversation = jest.fn();
const deleteConversation = jest.fn();
const onDeleted = jest.fn();
const onPinnedChange = jest.fn();
const onRefresh = jest.fn();

const props = (online = true) => ({
  conversation: { id: 'conversation-1', title: '기존 이름' },
  onDeleted,
  online,
  pinned: false,
  onPinnedChange,
  onRefresh,
});

const confirmDelete = (remove: () => void): void => {
  act(remove);
  const confirmation = jest
    .mocked(Alert.alert)
    .mock.calls.find(([title]) => title === '대화를 삭제할까요?');
  const buttons = confirmation?.[2] as ReadonlyArray<AlertButton> | undefined;
  const destructive = buttons?.find(({ style }) => style === 'destructive');
  if (!destructive?.onPress) throw new Error('delete confirmation unavailable');
  act(destructive.onPress);
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  renameConversation.mockResolvedValue({
    data: { renameConversation: { conversation: null, userErrors: [] } },
  });
  deleteConversation.mockResolvedValue({
    data: { deleteConversation: { success: true, userErrors: [] } },
  });
  mockedDeleteDraft.mockResolvedValue(undefined);
  mockedSetConversationPinned.mockResolvedValue(undefined);
  mockedPersistence.removeItem.mockResolvedValue(undefined);
  onRefresh.mockResolvedValue(undefined);
  mockedUseMutation.mockImplementation((document) => {
    if (document === RenameConversationDocument) return [renameConversation] as never;
    if (document === DeleteConversationDocument) return [deleteConversation] as never;
    throw new Error('unexpected mutation');
  });
});

describe('useConversationActions', () => {
  it('blocks remote rename and delete work while offline', async () => {
    const { result } = renderHook(() => useConversationActions(props(false)));

    await expect(result.current.rename('새 이름')).resolves.toBe(false);
    act(result.current.remove);

    expect(renameConversation).not.toHaveBeenCalled();
    expect(deleteConversation).not.toHaveBeenCalled();
    expect(mockedPersistence.removeItem).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      '오프라인',
      '대화 이름 변경은 온라인에서 할 수 있습니다.',
    );
    expect(Alert.alert).toHaveBeenCalledWith(
      '오프라인',
      '대화 삭제는 온라인에서 할 수 있습니다.',
    );
  });

  it('keeps the rename dialog open when the server returns a user error', async () => {
    renameConversation.mockResolvedValueOnce({
      data: {
        renameConversation: {
          conversation: null,
          userErrors: [
            { code: 'INVALID', message: '사용할 수 없는 이름', path: ['title'] },
          ],
        },
      },
    });
    const { result } = renderHook(() => useConversationActions(props()));

    await expect(result.current.rename('새 이름')).resolves.toBe(false);

    expect(Alert.alert).toHaveBeenCalledWith('이름 변경 실패', '사용할 수 없는 이름');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('keeps the rename dialog open when the network mutation rejects', async () => {
    renameConversation.mockRejectedValueOnce(new Error('network failed'));
    const { result } = renderHook(() => useConversationActions(props()));

    await expect(result.current.rename('새 이름')).resolves.toBe(false);

    expect(Alert.alert).toHaveBeenCalledWith('이름 변경 실패', '다시 시도해 주세요.');
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not refresh after the conversation action owner unmounts', async () => {
    let resolveRename!: (value: unknown) => void;
    renameConversation.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRename = resolve;
      }),
    );
    const { result, unmount } = renderHook(() => useConversationActions(props()));
    const request = result.current.rename('새 이름');

    unmount();
    resolveRename({
      data: { renameConversation: { conversation: null, userErrors: [] } },
    });
    await request;

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('returns success after rename when only the list refresh fails', async () => {
    onRefresh.mockRejectedValueOnce(new Error('refresh failed'));
    const { result } = renderHook(() => useConversationActions(props()));

    await expect(result.current.rename('  새 이름  ')).resolves.toBe(true);

    expect(renameConversation).toHaveBeenCalledWith({
      variables: { input: { id: 'conversation-1', title: '새 이름' } },
    });
    expect(Alert.alert).toHaveBeenCalledWith(
      '이름 변경 완료',
      '서버에서 이름은 변경됐지만 목록을 새로 고치지 못했습니다.',
    );
  });

  it('signals deletion, clears device state, and refreshes after server deletion', async () => {
    const { result } = renderHook(() => useConversationActions(props()));

    confirmDelete(result.current.remove);

    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(onDeleted).toHaveBeenCalledWith('conversation-1');
    expect(mockedPersistence.removeItem).toHaveBeenCalledWith('conversation-1');
    expect(mockedSetConversationPinned).toHaveBeenCalledWith('conversation-1', false);
    expect(mockedDeleteDraft).toHaveBeenCalledWith('conversation-1');
  });

  it('reports device cleanup failure after a successful server deletion', async () => {
    mockedPersistence.removeItem.mockRejectedValueOnce(new Error('cleanup failed'));
    const { result } = renderHook(() => useConversationActions(props()));

    confirmDelete(result.current.remove);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '삭제 완료',
        '서버에서 삭제되었지만 기기 캐시를 정리하지 못했습니다.',
      ),
    );
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('reports both cleanup and refresh failure after server deletion', async () => {
    mockedDeleteDraft.mockRejectedValueOnce(new Error('cleanup failed'));
    onRefresh.mockRejectedValueOnce(new Error('refresh failed'));
    const { result } = renderHook(() => useConversationActions(props()));

    confirmDelete(result.current.remove);

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        '삭제 완료',
        '서버에서 삭제되었지만 기기 캐시와 목록을 새로 고치지 못했습니다.',
      ),
    );
  });

  it('persists pin state before publishing it to the drawer', async () => {
    const { result } = renderHook(() => useConversationActions(props()));

    act(result.current.togglePin);

    await waitFor(() =>
      expect(onPinnedChange).toHaveBeenCalledWith('conversation-1', true),
    );
    expect(mockedSetConversationPinned).toHaveBeenCalledWith('conversation-1', true);
  });
});

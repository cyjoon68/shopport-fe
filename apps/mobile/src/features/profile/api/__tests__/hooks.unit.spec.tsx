import { useMutation, useQuery } from '@apollo/client/react';
import { renderHook } from '@testing-library/react-native';

import { type SessionStatus, useSession } from '@/features/auth';
import {
  DeleteViewerAccountDocument,
  UpdateViewerDocument,
  ViewerDocument,
} from '@/graphql/generated/graphql';
import { useOnline } from '@/providers/network-provider';

import { useProfile } from '../hooks';

jest.mock('@apollo/client/react', () => ({
  useMutation: jest.fn(),
  useQuery: jest.fn(),
}));

jest.mock('@/features/auth', () => ({ useSession: jest.fn() }));

jest.mock('@/providers/network-provider', () => ({ useOnline: jest.fn() }));

const mockedUseMutation = jest.mocked(useMutation);
const mockedUseOnline = jest.mocked(useOnline);
const mockedUseQuery = jest.mocked(useQuery);
const mockedUseSession = jest.mocked(useSession);
const updateViewer = jest.fn();
const deleteAccount = jest.fn();
let status: SessionStatus = 'authenticated';
let online = true;

describe('useProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    status = 'authenticated';
    online = true;
    mockedUseSession.mockImplementation(
      () => ({ status }) as ReturnType<typeof useSession>,
    );
    mockedUseOnline.mockImplementation(() => online);
    mockedUseQuery.mockReturnValue({
      data: { viewer: { displayName: '기존 닉네임' } },
    } as never);
    mockedUseMutation.mockImplementation((document) =>
      document === UpdateViewerDocument
        ? ([updateViewer, { loading: false }] as never)
        : document === DeleteViewerAccountDocument
          ? ([deleteAccount, { loading: false }] as never)
          : (() => {
              throw new Error('Unexpected mutation document');
            })(),
    );
    updateViewer.mockResolvedValue({
      data: { updateViewer: { userErrors: [], viewer: { displayName: '새 닉네임' } } },
    });
    deleteAccount.mockResolvedValue({
      data: { deleteViewerAccount: { success: true, userErrors: [] } },
    });
  });

  it('uses a remote viewer read for authenticated online sessions', () => {
    const { result } = renderHook(() => useProfile());

    expect(result.current.displayName).toBe('기존 닉네임');
    expect(mockedUseQuery).toHaveBeenCalledWith(ViewerDocument, {
      fetchPolicy: 'cache-and-network',
      skip: false,
    });
  });

  it('uses only cached viewer data for offline-authenticated sessions', () => {
    status = 'offline-authenticated';
    const { result } = renderHook(() => useProfile());

    expect(result.current.displayName).toBe('기존 닉네임');
    expect(mockedUseQuery).toHaveBeenCalledWith(ViewerDocument, {
      fetchPolicy: 'cache-only',
      skip: false,
    });
  });

  it('sends the requested display name and returns success from the update payload', async () => {
    const { result } = renderHook(() => useProfile());

    await expect(result.current.updateDisplayName('새 닉네임')).resolves.toBeNull();
    expect(updateViewer).toHaveBeenCalledWith({
      variables: { input: { displayName: '새 닉네임' } },
    });
  });

  it('returns an update user error or fallback when the update payload is unusable', async () => {
    updateViewer
      .mockResolvedValueOnce({
        data: {
          updateViewer: {
            userErrors: [{ message: '사용할 수 없는 닉네임' }],
            viewer: null,
          },
        },
      })
      .mockResolvedValueOnce({ data: { updateViewer: null } });
    const { result } = renderHook(() => useProfile());

    await expect(result.current.updateDisplayName('닉네임')).resolves.toBe(
      '사용할 수 없는 닉네임',
    );
    await expect(result.current.updateDisplayName('닉네임')).resolves.toBe(
      '다시 시도해 주세요.',
    );
  });

  it('returns the network fallback when updating the display name rejects', async () => {
    updateViewer.mockRejectedValueOnce(new Error('Network request failed'));
    const { result } = renderHook(() => useProfile());

    await expect(result.current.updateDisplayName('닉네임')).resolves.toBe(
      '연결을 확인하고 다시 시도해 주세요.',
    );
  });

  it('returns success from the delete payload', async () => {
    const { result } = renderHook(() => useProfile());

    await expect(result.current.deleteAccount()).resolves.toBeNull();
    expect(deleteAccount).toHaveBeenCalledWith();
  });

  it('returns a delete user error or fallback when the delete payload is unsuccessful', async () => {
    deleteAccount
      .mockResolvedValueOnce({
        data: {
          deleteViewerAccount: {
            success: false,
            userErrors: [{ message: '삭제할 수 없어요' }],
          },
        },
      })
      .mockResolvedValueOnce({ data: { deleteViewerAccount: null } });
    const { result } = renderHook(() => useProfile());

    await expect(result.current.deleteAccount()).resolves.toBe('삭제할 수 없어요');
    await expect(result.current.deleteAccount()).resolves.toBe('다시 시도해 주세요.');
  });

  it('returns the network fallback when deleting the account rejects', async () => {
    deleteAccount.mockRejectedValueOnce(new Error('Network request failed'));
    const { result } = renderHook(() => useProfile());

    await expect(result.current.deleteAccount()).resolves.toBe(
      '연결을 확인하고 다시 시도해 주세요.',
    );
  });

  it('exposes the update mutation loading state', () => {
    mockedUseMutation.mockImplementation((document) =>
      document === UpdateViewerDocument
        ? ([updateViewer, { loading: true }] as never)
        : document === DeleteViewerAccountDocument
          ? ([deleteAccount, { loading: false }] as never)
          : (() => {
              throw new Error('Unexpected mutation document');
            })(),
    );
    const { result } = renderHook(() => useProfile());

    expect(result.current.updating).toBe(true);
  });

  it('blocks retained profile mutations after the current session becomes offline', async () => {
    const { result, rerender } = renderHook(
      ({ version }: { version: number }) => {
        void version;
        return useProfile();
      },
      { initialProps: { version: 0 } },
    );
    const update = result.current.updateDisplayName;
    const remove = result.current.deleteAccount;

    status = 'offline-authenticated';
    rerender({ version: 1 });

    await expect(update('닉네임')).resolves.toBe('연결을 확인하고 다시 시도해 주세요.');
    await expect(remove()).resolves.toBe('연결을 확인하고 다시 시도해 주세요.');
    expect(updateViewer).not.toHaveBeenCalled();
    expect(deleteAccount).not.toHaveBeenCalled();
  });
});

import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { apolloClient } from '@/providers/apollo-client';
import {
  clearPrivateStorage,
  closePrivateStorage,
  openPrivateStorage,
} from '@/shared/storage';

import { authenticate, revokeSession, rotateTokens } from '../api/fetchers';
import {
  deleteRefreshToken,
  readRefreshToken,
  setAccessToken,
  writeRefreshToken,
} from '../auth-token';
import { useSession } from '../hooks';
import { kakaoIdentity } from '../native-auth';
import { SessionProvider } from '../session-provider';
import type { SessionContextValue, TokenPair } from '../types';

let mockOnline = true;

jest.mock('@/providers/apollo-client', () => ({
  apolloClient: { clearStore: jest.fn(() => Promise.resolve()) },
}));

jest.mock('@/providers/network-provider', () => ({ useOnline: () => mockOnline }));

jest.mock('@/shared/storage', () => ({
  clearPrivateStorage: jest.fn(() => Promise.resolve()),
  closePrivateStorage: jest.fn(() => Promise.resolve()),
  openPrivateStorage: jest.fn(() => Promise.resolve()),
}));

jest.mock('../api/fetchers', () => ({
  authenticate: jest.fn(),
  revokeSession: jest.fn(),
  rotateTokens: jest.fn(),
}));

jest.mock('../auth-token', () => ({
  deleteRefreshToken: jest.fn(() => Promise.resolve()),
  readRefreshToken: jest.fn(),
  setAccessToken: jest.fn(),
  writeRefreshToken: jest.fn(() => Promise.resolve()),
}));

jest.mock('../native-auth', () => ({ kakaoIdentity: jest.fn() }));

const mockedAuthenticate = jest.mocked(authenticate);
const mockedApolloClient = jest.mocked(apolloClient);
const mockedClearPrivateStorage = jest.mocked(clearPrivateStorage);
const mockedClosePrivateStorage = jest.mocked(closePrivateStorage);
const mockedDeleteRefreshToken = jest.mocked(deleteRefreshToken);
const mockedKakaoIdentity = jest.mocked(kakaoIdentity);
const mockedOpenPrivateStorage = jest.mocked(openPrivateStorage);
const mockedReadRefreshToken = jest.mocked(readRefreshToken);
const mockedRevokeSession = jest.mocked(revokeSession);
const mockedRotateTokens = jest.mocked(rotateTokens);
const mockedSetAccessToken = jest.mocked(setAccessToken);
const mockedWriteRefreshToken = jest.mocked(writeRefreshToken);

const tokens: TokenPair = {
  accessToken: 'access.new',
  refreshToken: 'refresh.new',
  expiresIn: 900,
};

const deferred = <T,>() => {
  let resolve = (_value: T): void => undefined;
  let reject = (_reason?: unknown): void => undefined;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
};

let currentSession: SessionContextValue | null = null;

const Probe = () => {
  currentSession = useSession();
  return <Text>{`${currentSession.status}:${currentSession.error ?? ''}`}</Text>;
};

const renderSession = () =>
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );

const session = (): SessionContextValue => {
  if (!currentSession) throw new Error('Session is unavailable');
  return currentSession;
};

const expectAuthenticated = async (): Promise<void> => {
  await waitFor(() => expect(session().status).toBe('authenticated'));
};

describe('session transitions', () => {
  beforeEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
    mockOnline = true;
    currentSession = null;
    mockedApolloClient.clearStore.mockResolvedValue([]);
    mockedAuthenticate.mockResolvedValue(tokens);
    mockedClearPrivateStorage.mockResolvedValue(undefined);
    mockedClosePrivateStorage.mockResolvedValue(undefined);
    mockedDeleteRefreshToken.mockResolvedValue(undefined);
    mockedKakaoIdentity.mockResolvedValue({
      identityToken: 'identity.token',
      nonce: 'nonce',
    });
    mockedOpenPrivateStorage.mockResolvedValue(undefined);
    mockedReadRefreshToken.mockResolvedValue(null);
    mockedRevokeSession.mockResolvedValue(undefined);
    mockedRotateTokens.mockResolvedValue(tokens);
    mockedWriteRefreshToken.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('clears local state and becomes a guest when online boot has no token', async () => {
    const screen = renderSession();

    await waitFor(() => expect(screen.getByText('guest:')).toBeOnTheScreen());

    expect(mockedSetAccessToken).toHaveBeenCalledWith(null);
    expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockedApolloClient.clearStore.mock.calls).toHaveLength(1);
    expect(mockedClearPrivateStorage).toHaveBeenCalledTimes(1);
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
  });

  it('opens private storage before exposing an offline session with a token', async () => {
    mockOnline = false;
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const opened = deferred<void>();
    mockedOpenPrivateStorage.mockReturnValue(opened.promise);
    const screen = renderSession();

    await waitFor(() => expect(mockedOpenPrivateStorage).toHaveBeenCalledTimes(1));
    expect(screen.getByText('booting:')).toBeOnTheScreen();
    expect(mockedRotateTokens).not.toHaveBeenCalled();

    opened.resolve(undefined);

    await waitFor(() =>
      expect(screen.getByText('offline-authenticated:')).toBeOnTheScreen(),
    );
  });

  it('closes an offline storage open that completes after logout', async () => {
    mockOnline = false;
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const opened = deferred<void>();
    mockedOpenPrivateStorage.mockReturnValue(opened.promise);
    renderSession();
    await waitFor(() => expect(mockedOpenPrivateStorage).toHaveBeenCalledTimes(1));

    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });
    expect(session().status).toBe('guest');
    expect(mockedClosePrivateStorage).toHaveBeenCalledTimes(1);

    opened.resolve(undefined);
    await act(async () => {
      await logoutPromise;
    });

    expect(session().status).toBe('guest');
    expect(mockedClosePrivateStorage).toHaveBeenCalledTimes(2);
  });

  it('reports a refresh-token read failure without exposing private storage', async () => {
    mockedReadRefreshToken.mockRejectedValue(new Error('read failed'));
    const screen = renderSession();

    await waitFor(() =>
      expect(
        screen.getByText('booting:세션을 확인할 수 없습니다. 연결을 확인해 주세요.'),
      ).toBeOnTheScreen(),
    );

    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
  });

  it('installs an online boot session only after credentials and storage are ready', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const opened = deferred<void>();
    mockedOpenPrivateStorage.mockReturnValue(opened.promise);
    const screen = renderSession();

    await waitFor(() => expect(mockedOpenPrivateStorage).toHaveBeenCalledTimes(1));
    expect(mockedWriteRefreshToken).toHaveBeenCalledWith('refresh.new');
    expect(screen.getByText('booting:')).toBeOnTheScreen();

    opened.resolve(undefined);

    await waitFor(() => expect(screen.getByText('authenticated:')).toBeOnTheScreen());
    expect(mockedSetAccessToken).toHaveBeenCalledWith('access.new');
  });

  it('shares one refresh flight across concurrent online and expiry triggers', async () => {
    jest.useFakeTimers();
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedRotateTokens.mockResolvedValueOnce({ ...tokens, expiresIn: 61 });
    const screen = renderSession();
    await expectAuthenticated();
    const refresh = deferred<TokenPair>();
    mockedRotateTokens.mockClear();
    mockedRotateTokens.mockReturnValue(refresh.promise);

    mockOnline = false;
    screen.rerender(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    mockOnline = true;
    screen.rerender(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1_000);
    });

    expect(mockedRotateTokens).toHaveBeenCalledTimes(1);
    refresh.resolve(tokens);
    await act(async () => {
      await refresh.promise;
    });
    await expectAuthenticated();
  });

  it('ignores a refresh that resolves after logout completed', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const refresh = deferred<TokenPair>();
    mockedRotateTokens.mockReturnValue(refresh.promise);
    const screen = renderSession();
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await session().logout();
    });
    expect(screen.getByText('guest:')).toBeOnTheScreen();

    refresh.resolve(tokens);
    await act(async () => {
      await refresh.promise;
      await Promise.resolve();
    });

    expect(screen.getByText('guest:')).toBeOnTheScreen();
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
  });

  it('ignores an old refresh rejection after a newer login succeeds', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const refresh = deferred<TokenPair>();
    mockedRotateTokens.mockReturnValue(refresh.promise);
    const screen = renderSession();
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await session().login();
    });
    expect(screen.getByText('authenticated:')).toBeOnTheScreen();

    refresh.reject(new TypeError('Network request failed'));
    await act(async () => {
      await refresh.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(screen.getByText('authenticated:')).toBeOnTheScreen();
    expect(mockedSetAccessToken).toHaveBeenLastCalledWith('access.new');
  });

  it('invalidates the session and closes private writes before logout awaits', async () => {
    mockedReadRefreshToken.mockResolvedValueOnce('session.secret');
    const readDuringLogout = deferred<string | null>();
    mockedReadRefreshToken.mockReturnValueOnce(readDuringLogout.promise);
    renderSession();
    await expectAuthenticated();

    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });

    expect(session().status).toBe('guest');
    expect(mockedSetAccessToken).toHaveBeenLastCalledWith(null);
    expect(mockedClosePrivateStorage).toHaveBeenCalledTimes(1);
    readDuringLogout.resolve('session.secret');
    await act(async () => {
      await logoutPromise;
    });
  });

  it('serializes an active credential write before logout deletion', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    const write = deferred<void>();
    mockedWriteRefreshToken.mockImplementation(() =>
      write.promise.then(() => {
        storedRefreshToken = 'refresh.new';
      }),
    );
    mockedDeleteRefreshToken.mockImplementation(() => {
      storedRefreshToken = null;
      return Promise.resolve();
    });
    mockedRotateTokens.mockResolvedValue(tokens);
    renderSession();
    await waitFor(() => expect(mockedWriteRefreshToken).toHaveBeenCalledTimes(1));

    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockedDeleteRefreshToken).not.toHaveBeenCalled();
    write.resolve(undefined);
    await act(async () => {
      await logoutPromise;
    });

    expect(storedRefreshToken).toBeNull();
    expect(session().status).toBe('guest');
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
  });

  it.each([
    [
      'SecureStore deletion',
      () => mockedDeleteRefreshToken.mockRejectedValueOnce(new Error('delete failed')),
    ],
    [
      'Apollo cache clearing',
      () =>
        mockedApolloClient.clearStore.mockRejectedValueOnce(new Error('apollo failed')),
    ],
    [
      'private storage clearing',
      () => mockedClearPrivateStorage.mockRejectedValueOnce(new Error('storage failed')),
    ],
  ])('finishes every local cleanup when %s rejects', async (_name, rejectCleanup) => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();
    rejectCleanup();

    await act(async () => {
      await session().logout();
    });

    expect(session().status).toBe('guest');
    expect(session().error).toBe(
      '로그아웃했지만 기기 데이터를 모두 정리하지 못했습니다.',
    );
    expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockedApolloClient.clearStore.mock.calls).toHaveLength(1);
    expect(mockedClearPrivateStorage).toHaveBeenCalledTimes(1);
  });

  it('preserves a revocation warning after local logout succeeds', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();
    mockedRevokeSession.mockRejectedValueOnce(new Error('revoke failed'));

    await act(async () => {
      await session().logout();
    });

    expect(session().status).toBe('guest');
    expect(session().error).toBe(
      '서버 로그아웃은 완료하지 못했지만 기기 세션은 제거했습니다.',
    );
  });
});

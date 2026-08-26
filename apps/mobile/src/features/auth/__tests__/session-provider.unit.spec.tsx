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
import { SessionExpiredError } from '../domain/errors';
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

  it('clears the current session when refresh reports expiry', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedRotateTokens.mockRejectedValue(
      new SessionExpiredError('세션이 만료되었습니다.'),
    );
    renderSession();

    await waitFor(() => expect(session().status).toBe('guest'));

    expect(session().error).toBeNull();
    expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockedApolloClient.clearStore.mock.calls).toHaveLength(1);
    expect(mockedClearPrivateStorage).toHaveBeenCalledTimes(1);
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
  });

  it('retries a current transient refresh failure', async () => {
    jest.useFakeTimers();
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedRotateTokens
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(tokens);
    renderSession();

    await waitFor(() =>
      expect(session().error).toBe('세션을 확인할 수 없습니다. 연결을 확인해 주세요.'),
    );
    expect(mockedRotateTokens).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(mockedRotateTokens).toHaveBeenCalledTimes(2);
    expect(session().status).toBe('authenticated');
    expect(session().error).toBeNull();
  });

  it('keeps credentials private when refresh returns an invalid response error', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedRotateTokens.mockRejectedValue(
      new Error('인증 서버 응답이 올바르지 않습니다.'),
    );
    const screen = renderSession();

    await waitFor(() =>
      expect(session().error).toBe('세션을 확인할 수 없습니다. 연결을 확인해 주세요.'),
    );

    expect(session().status).toBe('booting');
    expect(mockedWriteRefreshToken).not.toHaveBeenCalled();
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
    screen.unmount();
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

  it('ignores a refresh rejection after logout completed', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const refresh = deferred<TokenPair>();
    mockedRotateTokens.mockReturnValue(refresh.promise);
    const screen = renderSession();
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await session().logout();
    });
    refresh.reject(new TypeError('Network request failed'));
    await act(async () => {
      await refresh.promise.catch(() => undefined);
      await Promise.resolve();
    });

    expect(screen.getByText('guest:')).toBeOnTheScreen();
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
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

  it('ignores an old refresh success after a newer login succeeds', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const oldRefresh = deferred<TokenPair>();
    mockedRotateTokens.mockReturnValue(oldRefresh.promise);
    mockedAuthenticate.mockResolvedValue({
      accessToken: 'access.login',
      refreshToken: 'refresh.login',
      expiresIn: 900,
    });
    renderSession();
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    await act(async () => {
      await session().login();
    });
    oldRefresh.resolve({
      accessToken: 'access.old',
      refreshToken: 'refresh.old',
      expiresIn: 900,
    });
    await act(async () => {
      await oldRefresh.promise;
      await Promise.resolve();
    });

    expect(session().status).toBe('authenticated');
    expect(session().error).toBeNull();
    expect(mockedSetAccessToken).toHaveBeenLastCalledWith('access.login');
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.old');
  });

  it('keeps logout authoritative after repeated login attempts', async () => {
    renderSession();
    await waitFor(() => expect(session().status).toBe('guest'));
    jest.clearAllMocks();
    const firstIdentity = deferred<{
      identityToken: string;
      nonce: string;
    }>();
    mockedKakaoIdentity
      .mockReturnValueOnce(firstIdentity.promise)
      .mockResolvedValueOnce({ identityToken: 'identity.second', nonce: 'nonce.second' });
    mockedAuthenticate.mockResolvedValue({
      accessToken: 'access.second',
      refreshToken: 'refresh.second',
      expiresIn: 900,
    });

    let firstLogin: Promise<void> | undefined;
    act(() => {
      firstLogin = session().login();
    });
    await act(async () => {
      await session().login();
    });
    expect(session().status).toBe('authenticated');
    await act(async () => {
      await session().logout();
    });

    firstIdentity.resolve({ identityToken: 'identity.first', nonce: 'nonce.first' });
    await act(async () => {
      await firstLogin;
    });

    expect(mockedAuthenticate).toHaveBeenCalledTimes(1);
    expect(session().status).toBe('guest');
    expect(mockedSetAccessToken).toHaveBeenLastCalledWith(null);
  });

  it('recovers the credential queue after a refresh-token write failure', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedWriteRefreshToken
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);
    renderSession();

    await waitFor(() =>
      expect(session().error).toBe('세션을 확인할 수 없습니다. 연결을 확인해 주세요.'),
    );
    expect(session().status).toBe('booting');
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();

    await act(async () => {
      await session().login();
    });

    expect(mockedWriteRefreshToken).toHaveBeenCalledTimes(2);
    expect(session().status).toBe('authenticated');
    expect(session().error).toBeNull();
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

  it('keeps guest while token deletion is pending across an offline change', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    mockedWriteRefreshToken.mockImplementation((refreshToken) => {
      storedRefreshToken = refreshToken;
      return Promise.resolve();
    });
    const deletion = deferred<void>();
    mockedDeleteRefreshToken.mockImplementation(() =>
      deletion.promise.then(() => {
        storedRefreshToken = null;
      }),
    );
    const screen = renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();

    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });
    await waitFor(() => expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1));
    mockOnline = false;
    screen.rerender(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    const statusWhilePending = session().status;
    const openCallsWhilePending = mockedOpenPrivateStorage.mock.calls.length;
    const rotateCallsWhilePending = mockedRotateTokens.mock.calls.length;

    deletion.resolve(undefined);
    await act(async () => {
      await logoutPromise;
    });

    expect(statusWhilePending).toBe('guest');
    expect(openCallsWhilePending).toBe(0);
    expect(rotateCallsWhilePending).toBe(0);
    expect(session().status).toBe('guest');
  });

  it('keeps guest after rejected deletion across offline and online changes', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    mockedWriteRefreshToken.mockImplementation((refreshToken) => {
      storedRefreshToken = refreshToken;
      return Promise.resolve();
    });
    mockedDeleteRefreshToken.mockRejectedValue(new Error('delete failed'));
    const screen = renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();

    await act(async () => {
      await session().logout();
    });
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
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(session().status).toBe('guest');
    expect(session().error).toBe(
      '로그아웃했지만 기기 데이터를 모두 정리하지 못했습니다.',
    );
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
    expect(mockedRotateTokens).not.toHaveBeenCalled();
  });

  it('queues a remounted logout after a stale mount token write', async () => {
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
    const firstMount = renderSession();
    await waitFor(() => expect(mockedWriteRefreshToken).toHaveBeenCalledTimes(1));
    firstMount.unmount();
    jest.clearAllMocks();

    renderSession();
    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });
    await act(async () => {
      await Promise.resolve();
    });
    const deletionCallsBeforeWrite = mockedDeleteRefreshToken.mock.calls.length;

    write.resolve(undefined);
    await act(async () => {
      await logoutPromise;
    });

    expect(deletionCallsBeforeWrite).toBe(0);
    expect(storedRefreshToken).toBeNull();
    expect(session().status).toBe('guest');
  });

  it('queues a remounted install after a stale mount storage open', async () => {
    let storageOpen = false;
    let openCalls = 0;
    const firstOpen = deferred<void>();
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedOpenPrivateStorage.mockImplementation(() => {
      openCalls += 1;
      if (openCalls === 1)
        return firstOpen.promise.then(() => {
          storageOpen = true;
        });
      storageOpen = true;
      return Promise.resolve();
    });
    mockedClosePrivateStorage.mockImplementation(() => {
      storageOpen = false;
      return Promise.resolve();
    });
    const firstMount = renderSession();
    await waitFor(() => expect(openCalls).toBe(1));
    firstMount.unmount();

    renderSession();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const statusBeforeFirstOpen = session().status;
    const openCallsBeforeFirstOpen = openCalls;

    firstOpen.resolve(undefined);
    await expectAuthenticated();

    expect(statusBeforeFirstOpen).toBe('booting');
    expect(openCallsBeforeFirstOpen).toBe(1);
    expect(storageOpen).toBe(true);
  });

  it('shares repeated logout while preserving its revocation warning', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    mockedWriteRefreshToken.mockImplementation((refreshToken) => {
      storedRefreshToken = refreshToken;
      return Promise.resolve();
    });
    mockedDeleteRefreshToken.mockImplementation(() => {
      storedRefreshToken = null;
      return Promise.resolve();
    });
    const revocation = deferred<void>();
    mockedRevokeSession.mockReturnValue(revocation.promise);
    renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();

    let firstLogout: Promise<void> | undefined;
    act(() => {
      firstLogout = session().logout();
    });
    await waitFor(() => expect(mockedRevokeSession).toHaveBeenCalledTimes(1));
    let secondLogout: Promise<void> | undefined;
    act(() => {
      secondLogout = session().logout();
    });
    revocation.reject(new Error('revoke failed'));
    await act(async () => {
      await Promise.all([firstLogout, secondLogout]);
    });

    expect(session().status).toBe('guest');
    expect(session().error).toBe(
      '서버 로그아웃은 완료하지 못했지만 기기 세션은 제거했습니다.',
    );
    expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1);
    expect(mockedClearPrivateStorage).toHaveBeenCalledTimes(1);
  });

  it('starts a new logout after a newer login generation', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    mockedWriteRefreshToken.mockImplementation((refreshToken) => {
      storedRefreshToken = refreshToken;
      return Promise.resolve();
    });
    mockedDeleteRefreshToken.mockImplementation(() => {
      storedRefreshToken = null;
      return Promise.resolve();
    });
    mockedAuthenticate.mockResolvedValue({
      accessToken: 'access.login',
      refreshToken: 'refresh.login',
      expiresIn: 900,
    });
    const firstRevocation = deferred<void>();
    mockedRevokeSession
      .mockReturnValueOnce(firstRevocation.promise)
      .mockResolvedValueOnce(undefined);
    renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();

    let firstLogout: Promise<void> | undefined;
    act(() => {
      firstLogout = session().logout();
    });
    await waitFor(() => expect(mockedRevokeSession).toHaveBeenCalledTimes(1));
    await act(async () => {
      await session().login();
    });
    expect(session().status).toBe('authenticated');

    let secondLogout: Promise<void> | undefined;
    act(() => {
      secondLogout = session().logout();
    });
    expect(session().status).toBe('guest');
    await waitFor(() => expect(mockedRevokeSession).toHaveBeenCalledTimes(2));
    firstRevocation.reject(new Error('stale revoke failed'));
    await act(async () => {
      await Promise.all([firstLogout, secondLogout]);
    });

    expect(mockedRevokeSession).toHaveBeenNthCalledWith(2, 'refresh.login');
    expect(session().status).toBe('guest');
    expect(session().error).toBeNull();
  });

  it('does not continue bootstrap after unmount', async () => {
    const refreshToken = deferred<string | null>();
    mockedReadRefreshToken.mockReturnValue(refreshToken.promise);
    const screen = renderSession();
    await waitFor(() => expect(mockedReadRefreshToken).toHaveBeenCalledTimes(1));

    screen.unmount();
    jest.clearAllMocks();
    refreshToken.resolve('session.secret');
    await act(async () => {
      await refreshToken.promise;
      await Promise.resolve();
    });

    expect(mockedRotateTokens).not.toHaveBeenCalled();
    expect(mockedWriteRefreshToken).not.toHaveBeenCalled();
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
  });

  it('does not install a refresh that resolves after unmount', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    const refresh = deferred<TokenPair>();
    mockedRotateTokens.mockReturnValue(refresh.promise);
    const screen = renderSession();
    await waitFor(() => expect(mockedRotateTokens).toHaveBeenCalledTimes(1));

    screen.unmount();
    jest.clearAllMocks();
    refresh.resolve(tokens);
    await act(async () => {
      await refresh.promise;
      await Promise.resolve();
    });

    expect(mockedWriteRefreshToken).not.toHaveBeenCalled();
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
  });

  it('does not install a login that resolves after unmount', async () => {
    const screen = renderSession();
    await waitFor(() => expect(session().status).toBe('guest'));
    const authentication = deferred<TokenPair>();
    mockedAuthenticate.mockReturnValue(authentication.promise);
    jest.clearAllMocks();

    let loginPromise: Promise<void> | undefined;
    act(() => {
      loginPromise = session().login();
    });
    await waitFor(() => expect(mockedAuthenticate).toHaveBeenCalledTimes(1));
    screen.unmount();
    authentication.resolve(tokens);
    await act(async () => {
      await loginPromise;
    });

    expect(mockedWriteRefreshToken).not.toHaveBeenCalled();
    expect(mockedOpenPrivateStorage).not.toHaveBeenCalled();
    expect(mockedSetAccessToken).not.toHaveBeenCalledWith('access.new');
  });

  it('does not let an unmounted logout warning overwrite a remounted session', async () => {
    let storedRefreshToken: string | null = 'session.secret';
    mockedReadRefreshToken.mockImplementation(() => Promise.resolve(storedRefreshToken));
    mockedWriteRefreshToken.mockImplementation((refreshToken) => {
      storedRefreshToken = refreshToken;
      return Promise.resolve();
    });
    mockedDeleteRefreshToken.mockImplementation(() => {
      storedRefreshToken = null;
      return Promise.resolve();
    });
    const revocation = deferred<void>();
    mockedRevokeSession.mockReturnValueOnce(revocation.promise);
    const firstMount = renderSession();
    await expectAuthenticated();

    let logoutPromise: Promise<void> | undefined;
    act(() => {
      logoutPromise = session().logout();
    });
    await waitFor(() => expect(mockedDeleteRefreshToken).toHaveBeenCalledTimes(1));
    firstMount.unmount();
    storedRefreshToken = 'remount.secret';
    mockedRotateTokens.mockResolvedValue({
      accessToken: 'access.remount',
      refreshToken: 'refresh.remount',
      expiresIn: 900,
    });
    renderSession();
    await expectAuthenticated();

    revocation.reject(new Error('stale revoke failed'));
    await act(async () => {
      await logoutPromise;
    });

    expect(session().status).toBe('authenticated');
    expect(session().error).toBeNull();
    expect(mockedSetAccessToken).toHaveBeenLastCalledWith('access.remount');
  });

  it('cancels a pending retry timer on logout', async () => {
    jest.useFakeTimers();
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    mockedRotateTokens.mockRejectedValue(new TypeError('Network request failed'));
    renderSession();
    await waitFor(() =>
      expect(session().error).toBe('세션을 확인할 수 없습니다. 연결을 확인해 주세요.'),
    );
    mockedRotateTokens.mockClear();

    await act(async () => {
      await session().logout();
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(session().status).toBe('guest');
    expect(mockedRotateTokens).not.toHaveBeenCalled();
  });

  it('settles combined Apollo and private cleanup failures as one guest warning', async () => {
    mockedReadRefreshToken.mockResolvedValue('session.secret');
    renderSession();
    await expectAuthenticated();
    jest.clearAllMocks();
    mockedApolloClient.clearStore.mockRejectedValueOnce(new Error('apollo failed'));
    mockedClearPrivateStorage.mockRejectedValueOnce(new Error('storage failed'));

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
    [
      'private storage closing',
      () => mockedClosePrivateStorage.mockRejectedValueOnce(new Error('close failed')),
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

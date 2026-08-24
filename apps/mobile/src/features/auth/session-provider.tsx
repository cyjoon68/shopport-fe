import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { apolloClient } from '@/providers/apollo-client';
import { useOnline } from '@/providers/network-provider';
import { clearPrivateStorage } from '@/shared/storage/database';

import { loginErrorMessage } from './auth-error';
import type { TokenPair } from './auth-http';
import {
  authenticate,
  deleteRefreshToken,
  readRefreshToken,
  revokeSession,
  rotateTokens,
  SessionExpiredError,
  writeRefreshToken,
} from './auth-http';
import { setAccessToken } from './auth-token';
import { kakaoIdentity } from './native-auth';

type SessionStatus = 'booting' | 'authenticated' | 'guest';

type SessionContextValue = Readonly<{
  error: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  sessionVersion: number;
  status: SessionStatus;
}>;

const SessionContext = createContext<SessionContextValue | null>(null);
const refreshRetryMilliseconds = 5_000;

export const SessionProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const online = useOnline();
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);

  const install = useCallback(async (tokens: TokenPair): Promise<void> => {
    await writeRefreshToken(tokens.refreshToken);
    setAccessToken(tokens.accessToken);
    setExpiry(Date.now() + tokens.expiresIn * 1_000);
    setStatus('authenticated');
    setError(null);
  }, []);

  const clear = useCallback(async (): Promise<void> => {
    setAccessToken(null);
    setExpiry(null);
    await deleteRefreshToken();
    await apolloClient.clearStore();
    await clearPrivateStorage();
    setStatus('guest');
    setError(null);
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      setError(null);
      const refreshToken = await readRefreshToken();
      if (!refreshToken) {
        setStatus('guest');
        return;
      }
      await install(await rotateTokens(refreshToken));
    } catch (refreshError) {
      if (refreshError instanceof SessionExpiredError) {
        await clear();
        return;
      }
      setError('세션을 확인할 수 없습니다. 연결을 확인해 주세요.');
    }
  }, [clear, install]);

  useEffect(() => {
    if (online) void refresh();
  }, [online, refresh]);

  useEffect(() => {
    if (!online || !error || status === 'guest') return undefined;
    const timeout = setTimeout(() => void refresh(), refreshRetryMilliseconds);
    return () => clearTimeout(timeout);
  }, [error, online, refresh, status]);

  useEffect(() => {
    if (!expiry) return undefined;
    const timeout = setTimeout(
      () => void refresh(),
      Math.max(1_000, expiry - Date.now() - 60_000),
    );
    return () => clearTimeout(timeout);
  }, [expiry, refresh]);

  const login = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      const identity = await kakaoIdentity();
      await install(await authenticate('kakao', identity.identityToken, identity.nonce));
      setSessionVersion((current) => current + 1);
    } catch (loginError) {
      setError(loginErrorMessage(loginError));
    }
  }, [install]);

  const logout = useCallback(async (): Promise<void> => {
    const refreshToken = await readRefreshToken();
    if (refreshToken) {
      try {
        await revokeSession(refreshToken);
      } catch {
        setError('서버 로그아웃은 완료하지 못했지만 기기 세션은 제거했습니다.');
      }
    }
    await clear();
  }, [clear]);

  const value = useMemo(
    () => ({ error, login, logout, sessionVersion, status }),
    [error, login, logout, sessionVersion, status],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
};

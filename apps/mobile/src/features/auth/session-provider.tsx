import type { ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as Crypto from 'expo-crypto';
import { apolloClient } from '@/providers/apollo-client';
import { clearPrivateStorage } from '@/shared/storage/database';
import {
  authenticate,
  deleteRefreshToken,
  readRefreshToken,
  revokeSession,
  rotateTokens,
  writeRefreshToken,
} from './auth-http';
import type { AuthProviderName, TokenPair } from './auth-http';
import { setAccessToken } from './auth-token';
import { appleIdentity, kakaoIdentity } from './native-auth';
import { resetRevenueCat } from '@/features/subscription/revenuecat';

type SessionStatus = 'booting' | 'authenticated' | 'guest';

type SessionContextValue = Readonly<{
  error: string | null;
  login: (provider: AuthProviderName) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => Promise<void>;
  status: SessionStatus;
}>;

const SessionContext = createContext<SessionContextValue | null>(null);

const messageFrom = (error: unknown): string =>
  error instanceof Error ? error.message : '인증 중 오류가 발생했습니다.';

export const SessionProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | null>(null);

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
    await resetRevenueCat();
    setStatus('guest');
  }, []);

  const refresh = useCallback(async (): Promise<void> => {
    const refreshToken = await readRefreshToken();
    if (!refreshToken) {
      setStatus('guest');
      return;
    }
    try {
      await install(await rotateTokens(refreshToken));
    } catch {
      await clear();
    }
  }, [clear, install]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!expiry) return undefined;
    const timeout = setTimeout(
      () => void refresh(),
      Math.max(1_000, expiry - Date.now() - 60_000),
    );
    return () => clearTimeout(timeout);
  }, [expiry, refresh]);

  const login = useCallback(
    async (provider: AuthProviderName): Promise<void> => {
      setError(null);
      try {
        const identity =
          provider === 'apple' ? await appleIdentity() : await kakaoIdentity();
        await install(
          await authenticate(provider, identity.identityToken, identity.nonce),
        );
      } catch (loginError) {
        setError(messageFrom(loginError));
      }
    },
    [install],
  );

  const loginDemo = useCallback(async (): Promise<void> => {
    if (!__DEV__) return;
    setError(null);
    try {
      await install(await authenticate('kakao', 'demo', Crypto.randomUUID()));
    } catch (loginError) {
      setError(messageFrom(loginError));
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
    () => ({ error, login, loginDemo, logout, status }),
    [error, login, loginDemo, logout, status],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

export const useSession = (): SessionContextValue => {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider is missing');
  return value;
};

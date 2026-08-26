import { createContext, useEffect, useEffectEvent, useRef, useState } from 'react';

import { apolloClient } from '@/providers/apollo-client';
import { useOnline } from '@/providers/network-provider';
import {
  clearPrivateStorage,
  closePrivateStorage,
  openPrivateStorage,
} from '@/shared/storage';

import { authenticate, revokeSession, rotateTokens } from './api/fetchers';
import {
  deleteRefreshToken,
  readRefreshToken,
  setAccessToken,
  writeRefreshToken,
} from './auth-token';
import { loginErrorMessage, SessionExpiredError } from './domain/errors';
import { kakaoIdentity } from './native-auth';
import type {
  SessionContextValue,
  SessionProviderProps,
  SessionStatus,
  TokenPair,
} from './types';

export const SessionContext = createContext<SessionContextValue | null>(null);
const refreshRetryMilliseconds = 5_000;
const localCleanupWarning = '로그아웃했지만 기기 데이터를 모두 정리하지 못했습니다.';
const revocationWarning = '서버 로그아웃은 완료하지 못했지만 기기 세션은 제거했습니다.';

export const SessionProvider = ({ children }: SessionProviderProps) => {
  const online = useOnline();
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [error, setError] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<number | null>(null);
  const generationRef = useRef(0);
  const refreshFlightRef = useRef<{
    generation: number;
    promise: Promise<void>;
  } | null>(null);
  const credentialMutationRef = useRef<Promise<void>>(Promise.resolve());

  const serializeCredentialMutation = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = credentialMutationRef.current.then(operation, operation);
    credentialMutationRef.current = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const finishPrivateCleanup = async (storageClose: Promise<void>): Promise<void> => {
    const results = await Promise.allSettled([storageClose, clearPrivateStorage()]);
    const rejected = results.find((result) => result.status === 'rejected');
    if (rejected) throw rejected.reason;
  };

  const beginGuestSession = (): Readonly<{
    generation: number;
    storageClose: Promise<void>;
  }> => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setAccessToken(null);
    setExpiry(null);
    setStatus('guest');
    setError(null);
    return { generation, storageClose: closePrivateStorage() };
  };

  const clearLocalSession = async (captured: number): Promise<void> => {
    if (captured !== generationRef.current) return;
    const { generation, storageClose } = beginGuestSession();
    const results = await Promise.allSettled([
      serializeCredentialMutation(deleteRefreshToken),
      apolloClient.clearStore(),
      finishPrivateCleanup(storageClose),
    ]);
    if (generation !== generationRef.current) return;
    setError(
      results.some((result) => result.status === 'rejected') ? localCleanupWarning : null,
    );
  };

  const install = async (captured: number, tokens: TokenPair): Promise<void> => {
    await serializeCredentialMutation(async () => {
      if (captured !== generationRef.current) return;
      await writeRefreshToken(tokens.refreshToken);
      if (captured !== generationRef.current) return;
      await openPrivateStorage();
      if (captured !== generationRef.current) {
        await closePrivateStorage();
        return;
      }
      setAccessToken(tokens.accessToken);
      setExpiry(Date.now() + tokens.expiresIn * 1_000);
      setStatus('authenticated');
      setError(null);
    });
  };

  const refresh = useEffectEvent(
    (captured: number, knownRefreshToken?: string): Promise<void> => {
      const existing = refreshFlightRef.current;
      if (existing?.generation === captured) return existing.promise;
      const promise = (async (): Promise<void> => {
        try {
          if (captured !== generationRef.current) return;
          setError(null);
          const refreshToken =
            knownRefreshToken ?? (await serializeCredentialMutation(readRefreshToken));
          if (captured !== generationRef.current) return;
          if (!refreshToken) {
            await clearLocalSession(captured);
            return;
          }
          const tokens = await rotateTokens(refreshToken);
          if (captured !== generationRef.current) return;
          await install(captured, tokens);
        } catch (refreshError) {
          if (captured !== generationRef.current) return;
          if (refreshError instanceof SessionExpiredError) {
            await clearLocalSession(captured);
            return;
          }
          setError('세션을 확인할 수 없습니다. 연결을 확인해 주세요.');
        }
      })();
      refreshFlightRef.current = { generation: captured, promise };
      void promise.then(
        () => {
          if (refreshFlightRef.current?.promise === promise)
            refreshFlightRef.current = null;
        },
        () => {
          if (refreshFlightRef.current?.promise === promise)
            refreshFlightRef.current = null;
        },
      );
      return promise;
    },
  );

  const bootstrap = useEffectEvent(async (): Promise<void> => {
    const captured = generationRef.current;
    try {
      const refreshToken = await readRefreshToken();
      if (captured !== generationRef.current) return;
      if (!refreshToken) {
        await clearLocalSession(captured);
        return;
      }
      if (!online) {
        await serializeCredentialMutation(async () => {
          if (captured !== generationRef.current) return;
          await openPrivateStorage();
          if (captured !== generationRef.current) {
            await closePrivateStorage();
            return;
          }
          setStatus('offline-authenticated');
        });
        return;
      }
      await refresh(captured, refreshToken);
    } catch {
      if (captured !== generationRef.current) return;
      setError('세션을 확인할 수 없습니다. 연결을 확인해 주세요.');
    }
  });

  useEffect(() => {
    void bootstrap();
  }, [online]);

  useEffect(() => {
    if (!online || !error || status === 'guest') return undefined;
    const captured = generationRef.current;
    const timeout = setTimeout(() => void refresh(captured), refreshRetryMilliseconds);
    return () => clearTimeout(timeout);
  }, [error, online, status]);

  useEffect(() => {
    if (!expiry) return undefined;
    const captured = generationRef.current;
    const timeout = setTimeout(
      () => void refresh(captured),
      Math.max(1_000, expiry - Date.now() - 60_000),
    );
    return () => clearTimeout(timeout);
  }, [expiry]);

  useEffect(
    () => () => {
      generationRef.current += 1;
      setAccessToken(null);
      void closePrivateStorage().catch(() => undefined);
    },
    [],
  );

  const login = async (): Promise<void> => {
    const captured = generationRef.current + 1;
    generationRef.current = captured;
    setError(null);
    try {
      const identity = await kakaoIdentity();
      if (captured !== generationRef.current) return;
      const tokens = await authenticate('kakao', identity.identityToken, identity.nonce);
      if (captured !== generationRef.current) return;
      await install(captured, tokens);
    } catch (loginError) {
      if (captured !== generationRef.current) return;
      setError(loginErrorMessage(loginError));
    }
  };

  const logout = async (): Promise<void> => {
    const { generation, storageClose } = beginGuestSession();
    const refreshToken = serializeCredentialMutation(readRefreshToken);
    const secureStoreCleanup = serializeCredentialMutation(deleteRefreshToken);
    const revocation = refreshToken.then((token) =>
      token ? revokeSession(token) : undefined,
    );
    const results = await Promise.allSettled([
      revocation,
      secureStoreCleanup,
      apolloClient.clearStore(),
      finishPrivateCleanup(storageClose),
    ]);
    if (generation !== generationRef.current) return;
    const localCleanupFailed = results
      .slice(1)
      .some((result) => result.status === 'rejected');
    setStatus('guest');
    setError(
      localCleanupFailed
        ? localCleanupWarning
        : results[0]?.status === 'rejected'
          ? revocationWarning
          : null,
    );
  };

  const value = { error, login, logout, status };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
};

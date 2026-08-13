import * as SecureStore from 'expo-secure-store';
import { environment } from '@/shared/config/environment';

export type AuthProviderName = 'apple' | 'kakao';

export type TokenPair = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

const refreshTokenKey = 'shopport.refresh-token';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const parseTokenPair = (value: unknown): TokenPair => {
  if (
    !isRecord(value) ||
    typeof value.accessToken !== 'string' ||
    typeof value.refreshToken !== 'string' ||
    typeof value.expiresIn !== 'number' ||
    value.expiresIn <= 0
  ) {
    throw new Error('인증 서버 응답이 올바르지 않습니다.');
  }
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresIn: value.expiresIn,
  };
};

const post = async (path: string, body: unknown): Promise<Response> =>
  fetch(`${environment.apiUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

export const authenticate = async (
  provider: AuthProviderName,
  identityToken: string,
  nonce: string,
): Promise<TokenPair> => {
  const response = await post(`/v1/auth/${provider}`, { identityToken, nonce });
  if (!response.ok) throw new Error('로그인에 실패했습니다. 다시 시도해 주세요.');
  return parseTokenPair(await response.json());
};

export const rotateTokens = async (refreshToken: string): Promise<TokenPair> => {
  const response = await post('/v1/auth/refresh', { refreshToken });
  if (!response.ok) throw new Error('세션이 만료되었습니다.');
  return parseTokenPair(await response.json());
};

export const revokeSession = async (refreshToken: string): Promise<void> => {
  await post('/v1/auth/logout', { refreshToken });
};

export const readRefreshToken = (): Promise<string | null> =>
  SecureStore.getItemAsync(refreshTokenKey);

export const writeRefreshToken = (refreshToken: string): Promise<void> =>
  SecureStore.setItemAsync(refreshTokenKey, refreshToken, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });

export const deleteRefreshToken = (): Promise<void> =>
  SecureStore.deleteItemAsync(refreshTokenKey);

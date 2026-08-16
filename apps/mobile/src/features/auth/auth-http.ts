import * as SecureStore from 'expo-secure-store';
import { environment } from '@/shared/config/environment';

export type AuthProviderName = 'apple' | 'kakao';

export type TokenPair = Readonly<{
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}>;

const refreshTokenKey = 'shopport.refresh-token';
const authenticationRetryLimit = 8;
const authenticationRetryDelayMilliseconds = 1_000;

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

const postAuthentication = async (path: string, body: unknown): Promise<Response> => {
  for (let attempt = 0; attempt <= authenticationRetryLimit; attempt += 1) {
    try {
      return await post(path, body);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (attempt === authenticationRetryLimit) {
        throw new Error('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, authenticationRetryDelayMilliseconds),
      );
    }
  }
  throw new Error('로그인 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');
};

export const authenticate = async (
  provider: AuthProviderName,
  identityToken: string,
  nonce: string,
  displayName?: string,
): Promise<TokenPair> => {
  const response = await postAuthentication(`/v1/auth/${provider}`, {
    identityToken,
    nonce,
    ...(provider === 'apple' && displayName ? { displayName } : {}),
  });
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

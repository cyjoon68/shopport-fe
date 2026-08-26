import { environment } from '@/shared/config/environment';

import { SessionExpiredError } from '../domain/errors';
import type { AuthProviderName, TokenPair } from '../types';
import { parseTokenPair } from './schemas';

const authenticationRetryLimit = 8;
const authenticationRetryDelayMilliseconds = 1_000;

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
): Promise<TokenPair> => {
  const response = await postAuthentication(`/v1/auth/${provider}`, {
    identityToken,
    nonce,
  });
  if (!response.ok) throw new Error('로그인에 실패했습니다. 다시 시도해 주세요.');
  return parseTokenPair(await response.json());
};

export const rotateTokens = async (refreshToken: string): Promise<TokenPair> => {
  const response = await post('/v1/auth/refresh', { refreshToken });
  if (response.status === 401 || response.status === 403) {
    throw new SessionExpiredError('세션이 만료되었습니다.');
  }
  if (!response.ok) throw new Error('세션 서버에 연결할 수 없습니다.');
  return parseTokenPair(await response.json());
};

export const revokeSession = async (refreshToken: string): Promise<void> => {
  await post('/v1/auth/logout', { refreshToken });
};

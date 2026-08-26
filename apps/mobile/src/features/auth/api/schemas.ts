import type { TokenPair } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const parseTokenPair = (value: unknown): TokenPair => {
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

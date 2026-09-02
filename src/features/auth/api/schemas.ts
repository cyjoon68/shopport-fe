import type { TokenPair } from '../types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isExpirySeconds = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  Number.isFinite(value) &&
  value > 0;

export const parseTokenPair = (value: unknown): TokenPair => {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.accessToken) ||
    !isNonEmptyString(value.refreshToken) ||
    !isExpirySeconds(value.expiresIn)
  ) {
    throw new Error('인증 서버 응답이 올바르지 않습니다.');
  }
  return {
    accessToken: value.accessToken,
    refreshToken: value.refreshToken,
    expiresIn: value.expiresIn,
  };
};

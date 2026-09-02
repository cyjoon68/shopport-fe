import { parseTokenPair } from '../schemas';

describe('token response schema', () => {
  it.each([
    { accessToken: '', refreshToken: 'refresh', expiresIn: 900 },
    { accessToken: 'access', refreshToken: ' ', expiresIn: 900 },
    { accessToken: 'access', refreshToken: 'refresh', expiresIn: Infinity },
    { accessToken: 'access', refreshToken: 'refresh', expiresIn: 1.5 },
    {
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: Number.MAX_SAFE_INTEGER + 1,
    },
  ])('rejects an unusable token pair', (value) => {
    expect(() => parseTokenPair(value)).toThrow('인증 서버 응답이 올바르지 않습니다.');
  });
});

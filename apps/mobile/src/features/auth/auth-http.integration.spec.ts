import { authenticate } from './auth-http';

describe('authentication HTTP contract', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('posts the identity token and nonce and accepts a rotating token pair', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access',
          refreshToken: 'session.secret',
          expiresIn: 900,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await expect(authenticate('kakao', 'oidc-token', 'nonce')).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'session.secret',
      expiresIn: 900,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/v1/auth/kakao',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ identityToken: 'oidc-token', nonce: 'nonce' }),
      }),
    );
  });

  it('sends an Apple display name only when it is present', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          accessToken: 'access',
          refreshToken: 'refresh',
          expiresIn: 900,
        }),
        { status: 200 },
      ),
    );
    await authenticate('apple', 'apple-token', 'nonce', '김 영준');
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4000/v1/auth/apple',
      expect.objectContaining({
        body: JSON.stringify({
          identityToken: 'apple-token',
          nonce: 'nonce',
          displayName: '김 영준',
        }),
      }),
    );
  });

  it('retries a transient Kakao network failure before rejecting login', async () => {
    jest.useFakeTimers();
    const fetchSpy = jest
      .spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            accessToken: 'access',
            refreshToken: 'session.secret',
            expiresIn: 900,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

    const result = authenticate('kakao', 'oidc-token', 'nonce');
    await jest.advanceTimersByTimeAsync(1_000);

    await expect(result).resolves.toEqual({
      accessToken: 'access',
      refreshToken: 'session.secret',
      expiresIn: 900,
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed token response', async () => {
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ accessToken: 'only-one-token' }), { status: 200 }),
      );
    await expect(authenticate('apple', 'oidc-token', 'nonce')).rejects.toThrow(
      '인증 서버 응답이 올바르지 않습니다.',
    );
  });
});

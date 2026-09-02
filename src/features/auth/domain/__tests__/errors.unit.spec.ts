import { loginErrorMessage } from '../errors';

describe('loginErrorMessage', () => {
  it('does not surface a cancelled Kakao authentication as an error', () => {
    expect(
      loginErrorMessage(
        new Error('The authentication session has been canceled by user.'),
      ),
    ).toBeNull();
  });

  it('does not expose native network details after a failed login', () => {
    const message = loginErrorMessage(
      new Error('fetch failed: UnexpectedException: 서버에 연결할 수 없습니다.'),
    );

    expect(message).not.toContain('fetch failed');
    expect(message).not.toContain('UnexpectedException');
  });
});

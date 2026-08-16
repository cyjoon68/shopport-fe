import { chatErrorPresentation } from './chat-errors';

describe('chat error routing', () => {
  it('routes expired trials to subscription', () => {
    expect(chatErrorPresentation({ code: 'TRIAL_EXPIRED' })).toEqual({
      message: '무료 체험이 종료되었습니다. 구독을 확인해 주세요.',
      route: '/subscription',
    });
  });

  it('shows the next KST reset for quota exhaustion', () => {
    const result = chatErrorPresentation(
      new Error('{"code":"QUOTA_EXCEEDED"}'),
      new Date('2026-08-13T14:59:00.000Z'),
    );
    expect(result.route).toBeNull();
    expect(result.message).toContain('8월 14일');
    expect(result.message).toContain('00:00 KST');
  });

  it('shows quota guidance when the native stream returns HTTP 429', () => {
    const result = chatErrorPresentation(
      new Error('XHR error! status: 429 undefined'),
      new Date('2026-08-13T14:59:00.000Z'),
    );

    expect(result.route).toBeNull();
    expect(result.message).toContain('오늘의 AI 사용량을 모두 사용했습니다.');
  });

  it('preserves generic reconnect guidance', () => {
    expect(chatErrorPresentation(new Error('Network request failed')).message).toBe(
      '응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.',
    );
  });
});

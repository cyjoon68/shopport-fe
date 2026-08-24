import { chatErrorPresentation } from './chat-errors';

describe('chat error routing', () => {
  it('shows transient rate-limit guidance for HTTP 429', () => {
    const result = chatErrorPresentation(new Error('XHR error! status: 429 undefined'));

    expect(result.route).toBeNull();
    expect(result.message).toBe('요청이 너무 빠릅니다. 잠시 후 다시 보내 주세요.');
  });

  it('preserves generic reconnect guidance', () => {
    expect(chatErrorPresentation(new Error('Network request failed')).message).toBe(
      '응답을 이어오지 못했습니다. 연결을 확인하고 다시 보내 주세요.',
    );
  });
});

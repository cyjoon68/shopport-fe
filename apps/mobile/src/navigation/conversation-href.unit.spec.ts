import { conversationHref } from './conversation-href';

describe('conversation href', () => {
  it('opens an existing conversation from root search params', () => {
    expect(conversationHref('conversation-1')).toEqual({
      pathname: '/',
      params: { id: 'conversation-1' },
    });
  });
});

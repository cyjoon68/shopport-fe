import { ActionButtonStories, actionButtonStoryTitle } from '@shopport/storybook';

describe('on-device Storybook catalog', () => {
  it('registers the shared action button stories', () => {
    expect(actionButtonStoryTitle).toBe('공통/ActionButton');
    expect(ActionButtonStories).toBeDefined();
  });
});

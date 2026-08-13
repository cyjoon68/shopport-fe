import { ActionButtonStories, actionButtonStoryTitle } from '@shopport/storybook';
import chatStateStories, {
  Error,
  ImageProcessing,
  LargeDynamicType,
  Loading,
  chatStateStoryTitle,
} from '@/features/chat/chat-state.stories';

describe('on-device Storybook catalog', () => {
  it('registers the shared action button stories', () => {
    expect(actionButtonStoryTitle).toBe('공통/ActionButton');
    expect(ActionButtonStories).toBeDefined();
  });

  it('registers chat loading, error, image processing and large type states', () => {
    expect(chatStateStoryTitle).toBe('채팅/상태');
    expect(chatStateStories).toBeDefined();
    expect([Loading, Error, ImageProcessing, LargeDynamicType]).toHaveLength(4);
  });
});

import type { Meta, StoryObj } from '@storybook/react-native';
import { ChatStatePreview } from './chat-state-preview';

export const chatStateStoryTitle = '채팅/상태';

const meta = {
  title: chatStateStoryTitle,
  component: ChatStatePreview,
  args: { state: 'loading' },
} satisfies Meta<typeof ChatStatePreview>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Loading: Story = {};
export const Error: Story = { args: { state: 'error' } };
export const ImageProcessing: Story = { args: { state: 'imageProcessing' } };
export const LargeDynamicType: Story = { args: { state: 'largeType' } };

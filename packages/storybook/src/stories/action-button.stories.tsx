import { ActionButton } from '@shopport/ui';
import type { Meta, StoryObj } from '@storybook/react-native';

export const actionButtonStoryTitle = '공통/ActionButton';

const meta = {
  title: actionButtonStoryTitle,
  component: ActionButton,
  args: { children: '상품 찾기', onPress: () => undefined },
} satisfies Meta<typeof ActionButton>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: 'secondary' } };

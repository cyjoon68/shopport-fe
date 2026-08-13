import type { StorybookConfig } from '@storybook/react-native';

const config: StorybookConfig = {
  stories: [
    '../../../packages/storybook/src/stories/**/*.stories.?(ts|tsx|js|jsx)',
    '../src/**/*.stories.?(ts|tsx|js|jsx)',
  ],
  deviceAddons: [
    '@storybook/addon-ondevice-controls',
    '@storybook/addon-ondevice-actions',
  ],
};

export default config;

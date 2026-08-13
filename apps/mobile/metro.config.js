const { getDefaultConfig } = require('expo/metro-config');
const { withStorybook } = require('@storybook/react-native/metro/withStorybook');

module.exports = withStorybook(getDefaultConfig(__dirname), {
  configPath: './.rnstorybook',
  enabled: process.env.EXPO_PUBLIC_STORYBOOK_ENABLED === 'true',
});

import { start } from '@storybook/react-native';
import '@storybook/addon-ondevice-controls/register';
import '@storybook/addon-ondevice-actions/register';

type StoryRequire = ((id: string) => unknown) & { keys: () => Array<string> };

type MetroRequire = NodeJS.Require & {
  context: (
    directory: string,
    useSubdirectories: boolean,
    matcher: RegExp,
  ) => StoryRequire;
};

const metroRequire = require as MetroRequire;
const matcher = /^\.\/(?:(?!\/\.).)*\.stories\.(?:ts|tsx|js|jsx)$/u;
const storyEntries = [
  {
    titlePrefix: '',
    directory: '../../../packages/storybook/src/stories',
    files: '**/*.stories.?(ts|tsx|js|jsx)',
    importPathMatcher: matcher,
    req: metroRequire.context('../../../packages/storybook/src/stories', true, matcher),
  },
];
type Annotation = NonNullable<Parameters<typeof start>[0]['annotations']>[number];
const annotation = (id: string): Annotation => metroRequire(id) as Annotation;
const annotations = [
  annotation('./preview'),
  annotation('@storybook/react-native/dist/preview'),
  annotation('@storybook/addon-ondevice-actions/preview'),
];

export const view = start({ annotations, storyEntries });

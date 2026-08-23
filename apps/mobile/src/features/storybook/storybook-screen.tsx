import { Redirect } from 'expo-router';

import { environment } from '@/shared/config/environment';

import StorybookRoot from '../../../.rnstorybook';

export const StorybookScreen = () =>
  environment.storybookEnabled ? <StorybookRoot /> : <Redirect href="/" />;

import { Redirect } from 'expo-router';
import StorybookRoot from '../../../.rnstorybook';
import { environment } from '@/shared/config/environment';

export const StorybookScreen = () =>
  environment.storybookEnabled ? <StorybookRoot /> : <Redirect href="/" />;

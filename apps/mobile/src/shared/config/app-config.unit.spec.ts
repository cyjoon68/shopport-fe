import type { ConfigContext } from 'expo/config';

import configure from '../../../app.config';

const context = { config: {} } as ConfigContext;
const keys = [
  'EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
] as const;

describe('production app configuration', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of keys) previous.set(key, process.env[key]);
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY = 'secure-kakao-key';
    delete process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  });

  afterEach(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    previous.clear();
  });

  it('requires HTTPS API and privacy-policy URLs', () => {
    expect(() => configure(context)).toThrow('EXPO_PUBLIC_API_URL');

    process.env.EXPO_PUBLIC_API_URL = 'https://api.shopport.example';
    expect(() => configure(context)).toThrow('EXPO_PUBLIC_PRIVACY_POLICY_URL');

    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://shopport.example/privacy';
    expect(() => configure(context)).not.toThrow();
  });
});

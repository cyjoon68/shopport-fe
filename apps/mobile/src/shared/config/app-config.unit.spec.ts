import type { ConfigContext } from 'expo/config';

import configure from '../../../app.config';

const context = { config: {} } as ConfigContext;
const keys = [
  'EAS_BUILD_PROFILE',
  'EXPO_PUBLIC_API_URL',
  'EXPO_PUBLIC_E2E_MODE',
  'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY',
  'EXPO_PUBLIC_PRIVACY_POLICY_URL',
] as const;

describe('production app configuration', () => {
  const previous = new Map<string, string | undefined>();

  beforeEach(() => {
    for (const key of keys) {
      const value: unknown = process.env[key];
      previous.set(key, typeof value === 'string' ? value : undefined);
    }
    process.env.EAS_BUILD_PROFILE = 'production';
    process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY = 'secure-kakao-key';
    delete process.env.EXPO_PUBLIC_E2E_MODE;
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
    expect(configure(context).experiments).toMatchObject({
      reactCompiler: true,
      typedRoutes: true,
    });
    expect(configure(context).plugins).toContain('expo-sqlite');
  });

  it('rejects the E2E identity mode from production builds', () => {
    process.env.EXPO_PUBLIC_API_URL = 'https://api.shopport.example';
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL = 'https://shopport.example/privacy';
    process.env.EXPO_PUBLIC_E2E_MODE = '1';

    expect(() => configure(context)).toThrow('EXPO_PUBLIC_E2E_MODE');
  });

  it('allows cleartext traffic only for E2E builds', () => {
    process.env.EAS_BUILD_PROFILE = 'development';
    process.env.EXPO_PUBLIC_E2E_MODE = '1';

    expect(JSON.stringify(configure(context).plugins)).toContain(
      '"usesCleartextTraffic":true',
    );

    delete process.env.EXPO_PUBLIC_E2E_MODE;
    expect(JSON.stringify(configure(context).plugins)).toContain(
      '"usesCleartextTraffic":false',
    );
  });
});

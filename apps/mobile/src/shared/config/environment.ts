const absoluteUrl = (value: string, name: string): string => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }
  return parsed.toString().replace(/\/$/u, '');
};

const environmentValue = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === 'string' ? value : undefined;
};

export const environment = {
  apiUrl: absoluteUrl(
    environmentValue('EXPO_PUBLIC_API_URL') ?? 'http://127.0.0.1:3000',
    'API URL',
  ),
  appleAndroidClientId: environmentValue('EXPO_PUBLIC_APPLE_ANDROID_CLIENT_ID') ?? '',
  appleAndroidRedirectUri:
    environmentValue('EXPO_PUBLIC_APPLE_ANDROID_REDIRECT_URI') ?? '',
  revenueCatAppleKey: environmentValue('EXPO_PUBLIC_REVENUECAT_APPLE_KEY') ?? '',
  revenueCatGoogleKey: environmentValue('EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY') ?? '',
  sentryDsn: environmentValue('EXPO_PUBLIC_SENTRY_DSN') ?? '',
  storybookEnabled: environmentValue('EXPO_PUBLIC_STORYBOOK_ENABLED') === 'true',
} as const;

const readEnv = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === 'string' ? value : undefined;
};

const absoluteUrl = (value: string, name: string): string => {
  const parsed = new URL(value);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${name} must use http or https`);
  }
  return parsed.toString().replace(/\/$/u, '');
};

const optionalAbsoluteUrl = (value: string | undefined, name: string): string | null =>
  value ? absoluteUrl(value, name) : null;

export const environment = {
  apiUrl: absoluteUrl(
    readEnv('EXPO_PUBLIC_API_URL') ?? 'http://127.0.0.1:4000',
    'API URL',
  ),
  kakaoNativeAppKey: readEnv('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY') ?? '',
  privacyPolicyUrl: optionalAbsoluteUrl(
    readEnv('EXPO_PUBLIC_PRIVACY_POLICY_URL'),
    'Privacy policy URL',
  ),
  sentryDsn: readEnv('EXPO_PUBLIC_SENTRY_DSN') ?? '',
} as const;

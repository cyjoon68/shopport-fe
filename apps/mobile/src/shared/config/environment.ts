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
    process.env.EXPO_PUBLIC_API_URL ?? 'http://127.0.0.1:4000',
    'API URL',
  ),
  e2eMode: process.env.EXPO_PUBLIC_E2E_MODE === '1',
  kakaoNativeAppKey: process.env.EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY ?? '',
  privacyPolicyUrl: optionalAbsoluteUrl(
    process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    'Privacy policy URL',
  ),
  sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? '',
} as const;

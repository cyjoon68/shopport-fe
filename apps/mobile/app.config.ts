import type { ConfigContext, ExpoConfig } from 'expo/config';

const environmentValue = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === 'string' ? value : undefined;
};

const requireProductionHttpsUrl = (value: string | undefined, name: string): void => {
  if (!value) throw new Error(`${name} is required for production`);
  try {
    if (new URL(value).protocol !== 'https:') throw new Error();
  } catch {
    throw new Error(`${name} must be an HTTPS URL for production`);
  }
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const kakaoNativeAppKey =
    environmentValue('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY') ??
    'development-kakao-native-key';
  const easProjectId = environmentValue('EAS_PROJECT_ID');
  const apiUrl = environmentValue('EXPO_PUBLIC_API_URL');
  const privacyPolicyUrl = environmentValue('EXPO_PUBLIC_PRIVACY_POLICY_URL');
  if (environmentValue('EAS_BUILD_PROFILE') === 'production') {
    if (kakaoNativeAppKey.startsWith('development-')) {
      throw new Error('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY is required for production');
    }
    requireProductionHttpsUrl(apiUrl, 'EXPO_PUBLIC_API_URL');
    requireProductionHttpsUrl(privacyPolicyUrl, 'EXPO_PUBLIC_PRIVACY_POLICY_URL');
  }
  return {
    ...config,
    name: 'Shopport',
    slug: 'shopport',
    scheme: 'shopport',
    version: '0.1.0',
    orientation: 'default',
    runtimeVersion: { policy: 'fingerprint' },
    userInterfaceStyle: 'automatic',
    ios: {
      bundleIdentifier: 'com.cyjoon68.shopport',
      supportsTablet: true,
      infoPlist: {
        CFBundleDevelopmentRegion: 'ko',
        CFBundleLocalizations: ['ko'],
      },
    },
    android: {
      package: 'com.cyjoon68.shopport',
      adaptiveIcon: { backgroundColor: '#1F2228' },
      predictiveBackGestureEnabled: true,
      softwareKeyboardLayoutMode: 'resize',
    },
    plugins: [
      'expo-router',
      ['expo-dev-client', { toolsButton: false }],
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission: '상품을 이미지로 찾기 위해 사진 접근이 필요합니다.',
          cameraPermission: '상품을 촬영해 찾기 위해 카메라 접근이 필요합니다.',
        },
      ],
      'expo-image',
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '18.0' },
          android: {
            compileSdkVersion: 36,
            minSdkVersion: 29,
            targetSdkVersion: 36,
            extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
          },
        },
      ],
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: kakaoNativeAppKey,
          android: { authCodeHandlerActivity: true },
          ios: { handleKakaoOpenUrl: true },
        },
      ],
    ],
    experiments: { typedRoutes: true },
    extra: {
      apiUrl: apiUrl ?? 'http://127.0.0.1:4000',
      sentryDsn: environmentValue('EXPO_PUBLIC_SENTRY_DSN') ?? '',
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
    ...(easProjectId ? { updates: { url: `https://u.expo.dev/${easProjectId}` } } : {}),
  };
};

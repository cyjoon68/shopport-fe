import type { ConfigContext, ExpoConfig } from 'expo/config';

const environmentValue = (name: string): string | undefined => {
  const value: unknown = process.env[name];
  return typeof value === 'string' ? value : undefined;
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const kakaoNativeAppKey =
    environmentValue('EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY') ??
    'development-kakao-native-key';
  const easProjectId = environmentValue('EAS_PROJECT_ID');
  if (
    environmentValue('EAS_BUILD_PROFILE') === 'production' &&
    kakaoNativeAppKey.startsWith('development-')
  ) {
    throw new Error(
      'EXPO_PUBLIC_KAKAO_NATIVE_APP_KEY is required for production',
    );
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
      usesAppleSignIn: true,
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
      'expo-apple-authentication',
      'expo-secure-store',
      [
        'expo-image-picker',
        {
          photosPermission: '상품을 이미지로 찾기 위해 사진 접근이 필요합니다.',
          cameraPermission: '상품을 촬영해 찾기 위해 카메라 접근이 필요합니다.',
        },
      ],
      [
        'expo-build-properties',
        {
          ios: { deploymentTarget: '16.4' },
          android: {
            minSdkVersion: 24,
            extraMavenRepos: [
              'https://devrepo.kakao.com/nexus/content/groups/public/',
            ],
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
      apiUrl:
        environmentValue('EXPO_PUBLIC_API_URL') ?? 'http://127.0.0.1:4000',
      appleAndroidClientId:
        environmentValue('EXPO_PUBLIC_APPLE_ANDROID_CLIENT_ID') ?? '',
      appleAndroidRedirectUri:
        environmentValue('EXPO_PUBLIC_APPLE_ANDROID_REDIRECT_URI') ?? '',
      revenueCatAppleKey:
        environmentValue('EXPO_PUBLIC_REVENUECAT_APPLE_KEY') ?? '',
      revenueCatGoogleKey:
        environmentValue('EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY') ?? '',
      sentryDsn: environmentValue('EXPO_PUBLIC_SENTRY_DSN') ?? '',
      storybookEnabled:
        environmentValue('EXPO_PUBLIC_STORYBOOK_ENABLED') === 'true',
      ...(easProjectId ? { eas: { projectId: easProjectId } } : {}),
    },
    ...(easProjectId
      ? { updates: { url: `https://u.expo.dev/${easProjectId}` } }
      : {}),
  };
};

import { initializeKakaoSDK } from '@react-native-kakao/core';
import { me as kakaoMe } from '@react-native-kakao/user';

import { kakaoAccountEmail } from '../native-auth';

jest.mock('@react-native-kakao/core', () => ({
  initializeKakaoSDK: jest.fn(),
}));

jest.mock('@react-native-kakao/user', () => ({
  login: jest.fn(),
  me: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

jest.mock('@/shared/config/environment', () => ({
  environment: { kakaoNativeAppKey: 'test-kakao-app-key' },
}));

const mockedInitializeKakaoSDK = initializeKakaoSDK as jest.MockedFunction<
  typeof initializeKakaoSDK
>;
const mockedKakaoMe = kakaoMe as jest.MockedFunction<typeof kakaoMe>;

describe('native Kakao authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes the SDK before reading the Kakao account email', async () => {
    const calls: string[] = [];
    mockedInitializeKakaoSDK.mockImplementation(() => {
      calls.push('initialize');
      return Promise.resolve();
    });
    mockedKakaoMe.mockImplementation(() => {
      calls.push('me');
      return Promise.resolve({
        email: 'shopper@example.com',
        isEmailValid: true,
        isEmailVerified: true,
      } as never);
    });

    await expect(kakaoAccountEmail()).resolves.toBe('shopper@example.com');

    expect(calls).toEqual(['initialize', 'me']);
    expect(mockedInitializeKakaoSDK).toHaveBeenCalledWith('test-kakao-app-key');
  });
});

import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin, me as kakaoMe } from '@react-native-kakao/user';
import * as Crypto from 'expo-crypto';

import { environment } from '@/shared/config/environment';

import { kakaoAccountEmail, kakaoIdentity } from '../native-auth';

jest.mock('@react-native-kakao/core', () => ({
  initializeKakaoSDK: jest.fn(),
}));

jest.mock('@react-native-kakao/user', () => ({
  login: jest.fn(),
  me: jest.fn(),
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));

jest.mock('@/shared/config/environment', () => ({
  environment: { e2eMode: false, kakaoNativeAppKey: 'test-kakao-app-key' },
}));

const mockedInitializeKakaoSDK = initializeKakaoSDK as jest.MockedFunction<
  typeof initializeKakaoSDK
>;
const mockedKakaoMe = kakaoMe as jest.MockedFunction<typeof kakaoMe>;
const mockedKakaoLogin = kakaoLogin as jest.MockedFunction<typeof kakaoLogin>;
const mockedRandomUuid = Crypto.randomUUID as jest.MockedFunction<
  typeof Crypto.randomUUID
>;
const mockedEnvironment = environment as {
  e2eMode: boolean;
  kakaoNativeAppKey: string;
};

describe('native Kakao authentication', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedEnvironment.e2eMode = false;
  });

  it('uses a deterministic identity without initializing Kakao in E2E mode', async () => {
    mockedEnvironment.e2eMode = true;

    await expect(kakaoIdentity()).resolves.toEqual({
      identityToken: 'maestro-identity-token',
      nonce: 'maestro-identity-nonce',
    });

    expect(mockedInitializeKakaoSDK).not.toHaveBeenCalled();
    expect(mockedKakaoLogin).not.toHaveBeenCalled();
    expect(mockedRandomUuid).not.toHaveBeenCalled();
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

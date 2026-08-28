import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin, me as kakaoMe } from '@react-native-kakao/user';
import * as Crypto from 'expo-crypto';

import { environment } from '@/shared/config/environment';

import type { IdentityCredential } from './types';

const initializeKakao = async (): Promise<void> => {
  if (!environment.kakaoNativeAppKey) {
    throw new Error('카카오 네이티브 앱 키 설정이 필요합니다.');
  }
  await initializeKakaoSDK(environment.kakaoNativeAppKey);
};

export const kakaoIdentity = async (): Promise<IdentityCredential> => {
  if (environment.e2eMode) {
    return {
      identityToken: 'maestro-identity-token',
      nonce: 'maestro-identity-nonce',
    };
  }
  await initializeKakao();
  const nonce = Crypto.randomUUID();
  const credential = await kakaoLogin({ nonce });
  if (!credential.idToken) throw new Error('Kakao OIDC 토큰을 받지 못했습니다.');
  return { identityToken: credential.idToken, nonce };
};

export const kakaoAccountEmail = async (): Promise<string | null> => {
  await initializeKakao();
  const account = await kakaoMe();
  return account.email && account.isEmailValid && account.isEmailVerified
    ? account.email
    : null;
};

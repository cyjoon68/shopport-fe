import * as Crypto from 'expo-crypto';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import { login as kakaoLogin } from '@react-native-kakao/user';
import { environment } from '@/shared/config/environment';

export type IdentityCredential = Readonly<{
  identityToken: string;
  nonce: string;
}>;

export const kakaoIdentity = async (): Promise<IdentityCredential> => {
  if (!environment.kakaoNativeAppKey) {
    throw new Error('카카오 네이티브 앱 키 설정이 필요합니다.');
  }
  await initializeKakaoSDK(environment.kakaoNativeAppKey);
  const nonce = Crypto.randomUUID();
  const credential = await kakaoLogin({ nonce });
  if (!credential.idToken) throw new Error('Kakao OIDC 토큰을 받지 못했습니다.');
  return { identityToken: credential.idToken, nonce };
};

import * as AppleAuthentication from 'expo-apple-authentication';
import { AuthRequest, ResponseType } from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { login as kakaoLogin } from '@react-native-kakao/user';
import { environment } from '@/shared/config/environment';

export type IdentityCredential = Readonly<{
  identityToken: string;
  nonce: string;
  displayName?: string;
}>;

const noncePair = async (): Promise<Readonly<{ raw: string; digest: string }>> => {
  const raw = Crypto.randomUUID();
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, digest };
};

const appleOnIos = async (): Promise<IdentityCredential> => {
  const nonce = await noncePair();
  const credential = await AppleAuthentication.signInAsync({
    nonce: nonce.digest,
    requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
  });
  if (!credential.identityToken) throw new Error('Apple ID 토큰을 받지 못했습니다.');
  const displayName = credential.fullName
    ? AppleAuthentication.formatFullName(credential.fullName).trim()
    : '';
  return {
    identityToken: credential.identityToken,
    nonce: nonce.raw,
    ...(displayName ? { displayName } : {}),
  };
};

const appleOnAndroid = async (): Promise<IdentityCredential> => {
  if (!environment.appleAndroidClientId || !environment.appleAndroidRedirectUri) {
    throw new Error('Android Apple 로그인 설정이 필요합니다.');
  }
  const nonce = await noncePair();
  const request = new AuthRequest({
    clientId: environment.appleAndroidClientId,
    redirectUri: environment.appleAndroidRedirectUri,
    responseType: ResponseType.IdToken,
    usePKCE: false,
    extraParams: { nonce: nonce.digest, response_mode: 'fragment' },
  });
  const result = await request.promptAsync({
    authorizationEndpoint: 'https://appleid.apple.com/auth/authorize',
  });
  if (result.type !== 'success' || typeof result.params.id_token !== 'string') {
    throw new Error('Apple 로그인이 취소되었습니다.');
  }
  return { identityToken: result.params.id_token, nonce: nonce.raw };
};

export const appleIdentity = (): Promise<IdentityCredential> =>
  Platform.OS === 'ios' ? appleOnIos() : appleOnAndroid();

export const kakaoIdentity = async (): Promise<IdentityCredential> => {
  const nonce = Crypto.randomUUID();
  const credential = await kakaoLogin({
    nonce,
    scopes: ['profile_nickname', 'profile_image'],
  });
  if (!credential.idToken) throw new Error('Kakao OIDC 토큰을 받지 못했습니다.');
  return { identityToken: credential.idToken, nonce };
};

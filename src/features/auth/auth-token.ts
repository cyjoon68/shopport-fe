import * as SecureStore from 'expo-secure-store';

let accessToken: string | null = null;
const refreshTokenKey = 'shopport.refresh-token';

export const getAccessToken = (): string | null => accessToken;

export const setAccessToken = (value: string | null): void => {
  accessToken = value;
};

export const readRefreshToken = (): Promise<string | null> =>
  SecureStore.getItemAsync(refreshTokenKey);

export const writeRefreshToken = (refreshToken: string): Promise<void> =>
  SecureStore.setItemAsync(refreshTokenKey, refreshToken, {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });

export const deleteRefreshToken = (): Promise<void> =>
  SecureStore.deleteItemAsync(refreshTokenKey);

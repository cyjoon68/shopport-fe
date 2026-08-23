import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

import { environment } from '@/shared/config/environment';

let configuredUserId: string | null = null;

export const configureRevenueCat = async (userId: string): Promise<boolean> => {
  const apiKey =
    Platform.OS === 'ios'
      ? environment.revenueCatAppleKey
      : environment.revenueCatGoogleKey;
  if (!apiKey) return false;
  if (!(await Purchases.isConfigured())) {
    Purchases.configure({ apiKey, appUserID: userId });
    configuredUserId = userId;
    return true;
  }
  if (configuredUserId !== userId) await Purchases.logIn(userId);
  configuredUserId = userId;
  return true;
};

export const resetRevenueCat = async (): Promise<void> => {
  if (!(await Purchases.isConfigured())) return;
  try {
    await Purchases.logOut();
  } finally {
    configuredUserId = null;
  }
};

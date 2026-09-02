import * as SecureStore from 'expo-secure-store';

import { writeRefreshToken } from '../auth-token';

jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
  setItemAsync: jest.fn(() => Promise.resolve()),
}));

describe('refresh token storage', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('stores the refresh token with the device-only accessibility policy', async () => {
    await writeRefreshToken('session.secret');

    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'shopport.refresh-token',
      'session.secret',
      {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      },
    );
  });
});

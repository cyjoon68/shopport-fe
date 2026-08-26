import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { clearPrivateStorage } from '@/shared/storage/database';

import { rotateTokens } from '../api/fetchers';
import { deleteRefreshToken } from '../auth-token';
import { useSession } from '../hooks';
import { SessionProvider } from '../session-provider';

const mockClearStore = jest.fn(() => Promise.resolve());

jest.mock('@/providers/apollo-client', () => ({
  apolloClient: { clearStore: mockClearStore },
}));

jest.mock('@/providers/network-provider', () => ({ useOnline: () => true }));

jest.mock('@/shared/storage/database', () => ({
  clearPrivateStorage: jest.fn(() => Promise.resolve()),
}));

jest.mock('../api/fetchers', () => ({
  authenticate: jest.fn(),
  revokeSession: jest.fn(),
  rotateTokens: jest.fn(() => Promise.reject(new TypeError('Network request failed'))),
}));

jest.mock('../auth-token', () => ({
  deleteRefreshToken: jest.fn(() => Promise.resolve()),
  readRefreshToken: jest.fn(() => Promise.resolve('session.secret')),
  setAccessToken: jest.fn(),
  writeRefreshToken: jest.fn(),
}));

jest.mock('../native-auth', () => ({ kakaoIdentity: jest.fn() }));

const mockedRotateTokens = jest.mocked(rotateTokens);

const Probe = () => {
  const session = useSession();
  return <Text>{`${session.status}:${session.error ?? ''}`}</Text>;
};

describe('session refresh failure handling', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('preserves the refresh token and private data during a network outage', async () => {
    const screen = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await waitFor(() => expect(rotateTokens).toHaveBeenCalled());

    expect(screen.getByText(/booting:/u)).toBeOnTheScreen();
    expect(deleteRefreshToken).not.toHaveBeenCalled();
    expect(clearPrivateStorage).not.toHaveBeenCalled();
    expect(mockClearStore).not.toHaveBeenCalled();
  });

  it('retries a transient boot failure without a network-state change', async () => {
    jest.useFakeTimers();
    mockedRotateTokens
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        accessToken: 'access',
        refreshToken: 'rotated.secret',
        expiresIn: 900,
      });
    const screen = render(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );

    await act(async () => {
      await Promise.resolve();
    });
    expect(mockedRotateTokens).toHaveBeenCalledTimes(1);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(5_000);
    });

    expect(mockedRotateTokens).toHaveBeenCalledTimes(2);
    expect(screen.getByText('authenticated:')).toBeOnTheScreen();
    jest.useRealTimers();
  });
});

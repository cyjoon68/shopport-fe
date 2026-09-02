import type { NetInfoState } from '@react-native-community/netinfo';
import NetInfo from '@react-native-community/netinfo';
import { act, render } from '@testing-library/react-native';
import * as React from 'react';
import { Text } from 'react-native';

import { NetworkProvider, useOnline } from './network-provider';

let mockListener: ((state: NetInfoState) => void) | undefined;
const mockUnsubscribe = jest.fn();

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn((nextListener: (state: NetInfoState) => void) => {
      mockListener = nextListener;
      return mockUnsubscribe;
    }),
  },
}));

const State = () => <Text>{useOnline() ? 'online' : 'offline'}</Text>;

const connectivity = (
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): NetInfoState => ({ isConnected, isInternetReachable, type: 'wifi' }) as NetInfoState;

describe('network provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockListener = undefined;
  });

  it('defaults consumers to offline without a provider', () => {
    const screen = render(<State />);

    expect(screen.getByText('offline')).toBeOnTheScreen();
  });

  it('starts offline until connectivity is known', () => {
    const screen = render(
      <NetworkProvider>
        <State />
      </NetworkProvider>,
    );

    expect(screen.getByText('offline')).toBeOnTheScreen();
  });

  it('stays offline when the device is disconnected or the internet is unreachable', () => {
    const screen = render(
      <NetworkProvider>
        <State />
      </NetworkProvider>,
    );

    act(() => mockListener?.(connectivity(false, true)));
    expect(screen.getByText('offline')).toBeOnTheScreen();

    act(() => mockListener?.(connectivity(true, false)));
    expect(screen.getByText('offline')).toBeOnTheScreen();
  });

  it('becomes online when connectivity is restored', () => {
    const screen = render(
      <NetworkProvider>
        <State />
      </NetworkProvider>,
    );

    act(() => mockListener?.(connectivity(true, true)));

    expect(screen.getByText('online')).toBeOnTheScreen();
  });

  it('fails closed until internet reachability is explicitly restored', () => {
    const screen = render(
      <NetworkProvider>
        <State />
      </NetworkProvider>,
    );

    act(() => mockListener?.(connectivity(true, null)));
    expect(screen.getByText('offline')).toBeOnTheScreen();

    act(() => mockListener?.(connectivity(true, true)));
    expect(screen.getByText('online')).toBeOnTheScreen();
  });

  it('unsubscribes exactly once and ignores late listener updates', () => {
    const setOnline = jest.fn();
    let LateUpdateNetworkProvider = NetworkProvider;
    jest.isolateModules(() => {
      jest.doMock('react', () => ({
        ...React,
        useState: () => [false, setOnline],
      }));
      const networkProviderModule = jest.requireActual<{
        NetworkProvider: typeof NetworkProvider;
      }>('./network-provider');
      LateUpdateNetworkProvider = networkProviderModule.NetworkProvider;
    });
    const screen = render(
      <LateUpdateNetworkProvider>
        <Text>state</Text>
      </LateUpdateNetworkProvider>,
    );
    const lateListener = mockListener;

    screen.unmount();
    setOnline.mockClear();
    act(() => lateListener?.(connectivity(true, true)));

    expect(NetInfo.addEventListener).toHaveBeenCalledTimes(1);
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(setOnline).not.toHaveBeenCalled();
    jest.dontMock('react');
  });
});

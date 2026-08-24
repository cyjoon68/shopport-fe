import NetInfo from '@react-native-community/netinfo';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

const NetworkContext = createContext(true);

export const NetworkProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [online, setOnline] = useState(true);
  useEffect(
    () =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected === true && state.isInternetReachable !== false);
      }),
    [],
  );
  return <NetworkContext.Provider value={online}>{children}</NetworkContext.Provider>;
};

export const useOnline = (): boolean => useContext(NetworkContext);

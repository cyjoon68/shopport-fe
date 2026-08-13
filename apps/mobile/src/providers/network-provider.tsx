import NetInfo from '@react-native-community/netinfo';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

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
  const value = useMemo(() => online, [online]);
  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
};

export const useOnline = (): boolean => useContext(NetworkContext);

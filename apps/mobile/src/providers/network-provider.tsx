import NetInfo from '@react-native-community/netinfo';
import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useState } from 'react';

const NetworkContext = createContext(false);

export const NetworkProvider = ({ children }: Readonly<{ children: ReactNode }>) => {
  const [online, setOnline] = useState(false);
  useEffect(() => {
    let active = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      if (active)
        setOnline(state.isConnected === true && state.isInternetReachable !== false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return <NetworkContext.Provider value={online}>{children}</NetworkContext.Provider>;
};

export const NetworkBoundary = ({
  children,
  online,
}: Readonly<{ children: ReactNode; online: boolean }>) => (
  <NetworkContext.Provider value={online}>{children}</NetworkContext.Provider>
);

export const useOnline = (): boolean => useContext(NetworkContext);

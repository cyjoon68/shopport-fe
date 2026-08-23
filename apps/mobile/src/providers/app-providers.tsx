import { ApolloProvider } from '@apollo/client/react';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native-unistyles';

import { SessionProvider } from '@/features/auth/session-provider';

import { apolloClient } from './apollo-client';
import { NetworkProvider } from './network-provider';

export const AppProviders = ({ children }: Readonly<{ children: ReactNode }>) => (
  <GestureHandlerRootView style={styles.root}>
    <SafeAreaProvider>
      <ApolloProvider client={apolloClient}>
        <NetworkProvider>
          <SessionProvider>{children}</SessionProvider>
        </NetworkProvider>
      </ApolloProvider>
    </SafeAreaProvider>
  </GestureHandlerRootView>
);

const styles = StyleSheet.create({ root: { flex: 1 } });

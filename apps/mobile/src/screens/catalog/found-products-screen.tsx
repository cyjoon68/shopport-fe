import { Screen } from '@shopport/ui';
import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';
import { ProductList } from '@/features/catalog';
import { NetworkBoundary, useOnline } from '@/providers/network-provider';

export const FoundProductsScreen = () => {
  const { status } = useSession();
  const online = useOnline();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <NetworkBoundary online={status === 'authenticated' && online}>
      <Screen testID="found-products-screen">
        <ProductList scope="all-conversations" />
      </Screen>
    </NetworkBoundary>
  );
};

import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';
import { FavoriteProductList } from '@/features/favorites';
import { NetworkBoundary, useOnline } from '@/providers/network-provider';
import { Screen } from '@/shared/components';

export const FavoritesScreen = () => {
  const { status } = useSession();
  const online = useOnline();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <NetworkBoundary online={status === 'authenticated' && online}>
      <Screen testID="favorites-screen">
        <FavoriteProductList />
      </Screen>
    </NetworkBoundary>
  );
};

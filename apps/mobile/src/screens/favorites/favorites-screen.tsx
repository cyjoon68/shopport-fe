import { Screen } from '@shopport/ui';
import { Redirect } from 'expo-router';

import { useSession } from '@/features/auth';
import { FavoriteProductList } from '@/features/favorites';

export const FavoritesScreen = () => {
  const { status } = useSession();

  if (status === 'booting') return null;
  if (status === 'guest') return <Redirect href="/auth" />;

  return (
    <Screen testID="favorites-screen">
      <FavoriteProductList />
    </Screen>
  );
};
